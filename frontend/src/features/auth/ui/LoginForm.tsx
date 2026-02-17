import React, { useState } from 'react';
import { useRouter, Link } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { YStack, XStack, Text } from 'tamagui';
import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Card } from '@/shared/ui/Card';
import ScreenFormContainer from '@/shared/ui/ScreenFormContainer';
import PasswordInput from '@/shared/ui/PasswordInput';
import { login, getCurrentUser, ApiError } from '../api';
import type { LoginRequest } from '../api';
import { saveToken } from '@/shared/lib/utils/token-storage';
import { useAppStore } from '@/shared/lib/stores/app-store';
import { Mail, Lock } from '@tamagui/lucide-icons';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
const INVALID_CREDENTIALS_PATTERN =
  /(invalid|incorrect|wrong|credentials|password|email|unauthorized|not found|user not found)/i;

type FormData = z.infer<typeof schema>;

export default function LoginForm() {
  const { t } = useTranslation();
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const setAuth = useAppStore((s) => s.setAuth);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotice = (type: 'success' | 'error', title: string, message: string) => {
    setNotice({ type, message });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const resolveLoginErrorMessage = (error: unknown) => {
    const fallback = t('auth.loginError', 'An error occurred during login');
    const invalidCredentialsMessage = t('auth.invalidCredentials', 'Incorrect email or password');

    if (error instanceof ApiError) {
      if (error.status === 401 || error.code === 'INVALID_CREDENTIALS') {
        return invalidCredentialsMessage;
      }
      if ((error.status === 400 || error.status === 404) && INVALID_CREDENTIALS_PATTERN.test(error.message)) {
        return invalidCredentialsMessage;
      }
      if (INVALID_CREDENTIALS_PATTERN.test(error.message)) {
        return invalidCredentialsMessage;
      }
      return error.message || fallback;
    }

    if (error instanceof Error) {
      if (INVALID_CREDENTIALS_PATTERN.test(error.message)) {
        return invalidCredentialsMessage;
      }
      return error.message || fallback;
    }

    return fallback;
  };

  const onSubmit = async (values: LoginRequest) => {
    try {
      setIsLoading(true);
      setNotice(null);
      const res = await login(values);
      await saveToken(res.token);

      let profile = res.user;
      try {
        profile = await getCurrentUser(res.token);
      } catch (fetchError) {
        console.warn('Login profile refresh failed:', fetchError);
      }

      setAuth(res.token, profile);
      router.replace('/');
    } catch (error: unknown) {
      showNotice('error', t('common.error', 'Error'), resolveLoginErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const onInvalid = () => {
    const firstMessage =
      errors.email?.message ||
      errors.password?.message ||
      t('auth.loginInvalid', 'Please check the form fields');
    showNotice('error', t('common.error', 'Error'), firstMessage);
  };

  return (
    <ScreenFormContainer>
      <YStack gap="$6">
        {/* Header */}
        <YStack alignItems="center" gap="$4">
          <Text fontSize="$8" fontWeight="900" color="$gray12">
            {t('auth.signIn', 'Sign In')}
          </Text>
          <Text fontSize="$4" color="$gray10" textAlign="center">
            {t('auth.signInDesc', 'Welcome back! Please sign in to continue')}
          </Text>
        </YStack>

        {/* Form Card */}
        <Card>
          <YStack gap="$5">
            {/* Email */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <XStack gap="$3" alignItems="flex-start">
                  <YStack
                    width={40}
                    height={40}
                    backgroundColor="$gray3"
                    borderRadius="$6"
                    alignItems="center"
                    justifyContent="center"
                    marginTop="$6"
                  >
                    <Mail size={20} color="$gray11" />
                  </YStack>
                  <YStack flex={1}>
                    <Input
                      id="login-email"
                      name="email"
                      label={t('auth.email', 'Email')}
                      placeholder={t('auth.emailPlaceholder', 'Enter your email')}
                      value={value}
                      onChangeText={onChange}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      error={errors.email?.message}
                      required
                      textInputProps={{
                        autoComplete: 'email',
                        textContentType: 'emailAddress',
                      }}
                    />
                  </YStack>
                </XStack>
              )}
            />

            {/* Password */}
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <XStack gap="$3" alignItems="flex-start">
                  <YStack
                    width={40}
                    height={40}
                    backgroundColor="$gray3"
                    borderRadius="$6"
                    alignItems="center"
                    justifyContent="center"
                    marginTop="$6"
                  >
                    <Lock size={20} color="$gray11" />
                  </YStack>
                  <YStack flex={1}>
                    <PasswordInput
                      id="login-password"
                      name="password"
                      label={t('auth.password', 'Password')}
                      placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
                      value={value}
                      onChangeText={onChange}
                      error={errors.password?.message}
                      required
                      textInputProps={{
                        autoComplete: 'current-password',
                        textContentType: 'password',
                      }}
                    />
                  </YStack>
                </XStack>
              )}
            />

            {/* Forgot */}
            <XStack justifyContent="flex-end">
              <Text fontSize="$3" color="#2ECC71" fontWeight="500">
                {t('auth.forgotPassword', 'Forgot Password?')}
              </Text>
            </XStack>

            {/* Submit */}
            <Button
              title={isLoading ? t('common.loading', 'Loading...') : t('auth.signIn', 'Sign In')}
              variant="primary"
              size="large"
              onPress={handleSubmit(onSubmit, onInvalid)}
              disabled={isLoading}
            />
            {notice && (
              <Text fontSize="$3" color={notice.type === 'error' ? '$red10' : '$green10'}>
                {notice.message}
              </Text>
            )}
          </YStack>
        </Card>

        {/* Footer */}
        <YStack alignItems="center" gap="$3">
          <XStack alignItems="center" gap="$1">
            <YStack width={80} height={1} backgroundColor="$gray6" />
            <Text fontSize="$3" color="$gray9" paddingHorizontal="$3">
              {t('auth.noAccount', "Don't have an account?")}
            </Text>
            <YStack width={80} height={1} backgroundColor="$gray6" />
          </XStack>

          <Link href="/register" asChild>
            <Button title={t('auth.createAccount', 'Create Account')} variant="outline" size="medium" />
          </Link>
        </YStack>
      </YStack>
    </ScreenFormContainer>
  );
}
