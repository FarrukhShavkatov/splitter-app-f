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
import { register as registerUser, getCurrentUser, ApiError } from '../api';
import type { RegisterRequest } from '../api';
import { saveToken } from '@/shared/lib/utils/token-storage';
import { useAppStore } from '@/shared/lib/stores/app-store';
import { User, Mail, Lock } from '@tamagui/lucide-icons';

const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, number, and special character';
const ACCOUNT_EXISTS_PATTERN =
  /(already exists|already registered|duplicate|taken|conflict|user exists|email exists|username exists)/i;

const schema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().refine((value) => {
    if (value.length < 8) return false;
    if (!/[A-Z]/.test(value)) return false;
    if (!/[a-z]/.test(value)) return false;
    if (!/\d/.test(value)) return false;
    if (!/[^A-Za-z0-9]/.test(value)) return false;
    return true;
  }, PASSWORD_POLICY_MESSAGE),
});

type FormData = z.infer<typeof schema>;

export default function RegisterForm() {
  const { t } = useTranslation();
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', email: '', password: '' },
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

  const resolveRegisterErrorMessage = (error: unknown) => {
    if (error instanceof ApiError) {
      if (
        error.status === 409 ||
        error.code === 'ACCOUNT_EXISTS' ||
        ACCOUNT_EXISTS_PATTERN.test(error.message)
      ) {
        return t('auth.accountExists', 'An account with this email or username already exists');
      }
      return error.message || t('auth.registerError', 'An error occurred during registration');
    }

    if (error instanceof Error) {
      if (ACCOUNT_EXISTS_PATTERN.test(error.message)) {
        return t('auth.accountExists', 'An account with this email or username already exists');
      }
      return error.message || t('auth.registerError', 'An error occurred during registration');
    }

    return t('auth.registerError', 'An error occurred during registration');
  };

  const onSubmit = async (values: RegisterRequest) => {
    try {
      setIsLoading(true);
      setNotice(null);
      const res = await registerUser(values);
      await saveToken(res.token);

      let profile = res.user;
      try {
        profile = await getCurrentUser(res.token);
      } catch (fetchError) {
        console.warn('Registration profile refresh failed:', fetchError);
      }

      setAuth(res.token, profile);
      showNotice(
        'success',
        t('common.success', 'Success'),
        t('auth.registerSuccess', 'Account created successfully')
      );
      router.replace('/');
    } catch (error: unknown) {
      showNotice('error', t('common.error', 'Error'), resolveRegisterErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const onInvalid = () => {
    const firstMessage =
      errors.username?.message ||
      errors.email?.message ||
      errors.password?.message ||
      t('auth.registerInvalid', 'Please check the form fields');
    showNotice('error', t('common.error', 'Error'), firstMessage);
  };

  return (
    <ScreenFormContainer>
      <YStack gap="$6">
        {/* Header */}
        <YStack alignItems="center" gap="$4">
          <Text fontSize="$8" fontWeight="900" color="$gray12">
            {t('auth.createAccount', 'Create Account')}
          </Text>
          <Text fontSize="$4" color="$gray10" textAlign="center">
            {t('auth.createAccountDesc', 'Join us to start splitting bills with friends')}
          </Text>
        </YStack>

        {/* Form Card */}
        <Card>
          <YStack gap="$5">
            {/* Username */}
            <Controller
              control={control}
              name="username"
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
                    <User size={20} color="$gray11" />
                  </YStack>
                  <YStack flex={1}>
                    <Input
                      id="register-username"
                      name="username"
                      label={t('auth.username', 'Username')}
                      placeholder={t('auth.usernamePlaceholder', 'Enter your username')}
                      value={value}
                      onChangeText={onChange}
                      error={errors.username?.message}
                      required
                      textInputProps={{
                        autoComplete: 'username',
                        textContentType: 'username',
                      }}
                    />
                  </YStack>
                </XStack>
              )}
            />

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
                      id="register-email"
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
                      id="register-password"
                      name="password"
                      label={t('auth.password', 'Password')}
                      placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
                      value={value}
                      onChangeText={onChange}
                      error={errors.password?.message}
                      required
                      textInputProps={{
                        autoComplete: 'new-password',
                        textContentType: 'newPassword',
                      }}
                    />
                    <Text fontSize="$2" color="$gray10" marginTop="$1">
                      {PASSWORD_POLICY_MESSAGE}
                    </Text>
                  </YStack>
                </XStack>
              )}
            />

            {/* Submit */}
            <Button
              title={isLoading ? t('common.loading', 'Loading...') : t('auth.createAccount', 'Create Account')}
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
              {t('auth.haveAccount', 'Already have an account?')}
            </Text>
            <YStack width={80} height={1} backgroundColor="$gray6" />
          </XStack>

          <Link href="/login" asChild>
            <Button title={t('auth.signIn', 'Sign In')} variant="outline" size="medium" />
          </Link>
        </YStack>
      </YStack>
    </ScreenFormContainer>
  );
}
