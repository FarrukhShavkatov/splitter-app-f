import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../config/prisma.js";
import type { Prisma } from "@prisma/client";
import { authenticateToken, type AuthRequest } from "../middleware/auth.js";
import { parseReceipt } from "../services/receiptParser.js";
import { createNotification } from "./notifications.js";

const router = Router();

const DEFAULT_CURRENCY_CODE = "UNKNOWN";

function normalizeCurrencyCode(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_CURRENCY_CODE;
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_CURRENCY_CODE;
  const upper = trimmed.toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : DEFAULT_CURRENCY_CODE;
}

function toMinorUnits(amount: number) {
  return Math.round(amount * 100);
}

function fromMinorUnits(amount: number) {
  return Math.round(amount) / 100;
}

function distributeWarikanTargets(totalMinor: number, participantIds: string[], organizerId: string) {
  const safeParticipantIds = participantIds.length > 0 ? participantIds : [organizerId];
  const baseShare = Math.floor(totalMinor / safeParticipantIds.length);
  const remainder = totalMinor - baseShare * safeParticipantIds.length;
  const targets = new Map<string, number>();

  safeParticipantIds.forEach((participantId) => {
    targets.set(participantId, baseShare);
  });
  targets.set(organizerId, (targets.get(organizerId) ?? 0) + remainder);

  return targets;
}

function buildWarikanAllocations(args: {
  items: Array<{ id: string; totalMinor: number }>;
  participantIds: string[];
  organizerId: string;
}) {
  const targets = distributeWarikanTargets(
    args.items.reduce((sum, item) => sum + item.totalMinor, 0),
    args.participantIds,
    args.organizerId
  );
  const remaining = new Map(targets);
  const allocations: Array<{
    itemId: string;
    participantId: string;
    shareAmount: number;
    shareRatio: number;
    splitMode: "warikan";
  }> = [];

  for (const item of args.items) {
    let itemRemaining = item.totalMinor;
    for (const participantId of args.participantIds) {
      if (itemRemaining <= 0) break;
      const participantRemaining = remaining.get(participantId) ?? 0;
      if (participantRemaining <= 0) continue;

      const shareMinor = Math.min(participantRemaining, itemRemaining);
      if (shareMinor <= 0) continue;

      remaining.set(participantId, participantRemaining - shareMinor);
      itemRemaining -= shareMinor;

      allocations.push({
        itemId: item.id,
        participantId,
        shareAmount: fromMinorUnits(shareMinor),
        shareRatio: item.totalMinor > 0 ? shareMinor / item.totalMinor : 0,
        splitMode: "warikan",
      });
    }

    if (itemRemaining > 0) {
      const organizerRemaining = remaining.get(args.organizerId) ?? 0;
      remaining.set(args.organizerId, Math.max(0, organizerRemaining - itemRemaining));
      allocations.push({
        itemId: item.id,
        participantId: args.organizerId,
        shareAmount: fromMinorUnits(itemRemaining),
        shareRatio: item.totalMinor > 0 ? itemRemaining / item.totalMinor : 0,
        splitMode: "warikan",
      });
    }
  }

  return allocations;
}

/**
 * @swagger
 * /sessions/scan:
 *   post:
 *     summary: Parse receipt image (session creation + immediate normalized items)
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionName, language, image]
 *             properties:
 *               sessionName:
 *                 type: string
 *                 example: "Кафе на Октябрь"
 *               language:
 *                 type: string
 *                 example: ru-RU
 *               image:
 *                 type: object
 *                 required: [mimeType, data]
 *                 properties:
 *                   mimeType:
 *                     type: string
 *                     example: image/jpeg
 *                   data:
 *                     type: string
 *                     description: Base64 image data
 *     responses:
 *       200:
 *         description: Parsed receipt items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId: { type: integer }
 *                 sessionName: { type: string }
 *                 language: { type: string }
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       unitPrice: { type: number }
 *                       quantity: { type: number }
 *                       totalPrice: { type: number }
 *                       kind: { type: string, nullable: true }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     grandTotal: { type: number }
 *                     currency: { type: string, nullable: true, example: "USD" }
 */
router.post(
  "/scan",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { sessionName, language, image } = req.body || {};
      if (!sessionName || typeof sessionName !== "string") {
        return res.status(400).json({ error: "sessionName required" });
      }
      if (!language || typeof language !== "string") {
        return res.status(400).json({ error: "language required" });
      }
      if (
        !image ||
        typeof image !== "object" ||
        !image.mimeType ||
        !image.data
      ) {
        return res
          .status(400)
          .json({ error: "image { mimeType, data } required" });
      }

      // Create session (name field exists in schema but older DB may lack column; ignore until migration applied)
      const session = await prisma.session.create({
        data: {
          creatorId: req.user.id,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      const parseResult = await parseReceipt({
        language,
        sessionName,
        mimeType: image.mimeType,
        imageBase64: image.data,
      });

      return res.json({
        sessionId: session.id,
        sessionName,
        language,
        items: parseResult.items,
        summary: parseResult.summary,
        source: parseResult.source,
        ...(process.env.DEBUG_PARSE === "1" && parseResult.rawModelText
          ? {
              _debug: {
                model: parseResult.model,
                durationMs: parseResult.durationMs,
                usedModelVersion: parseResult.usedModelVersion,
                modelsTried: parseResult.modelsTried,
                raw: parseResult.rawModelText,
              },
            }
          : {}),
      });
    } catch (err) {
      console.error("POST /sessions/scan error", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * @swagger
 * tags:
 *   name: Sessions
 *   description: Receipt split sessions
 */

/**
 * @swagger
 * /sessions:
 *   post:
 *     summary: Create a session (optionally within a group)
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               groupId:
 *                 type: integer
 *                 nullable: true
 *               serviceFee:
 *                 type: number
 *                 nullable: true
 *               total:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Session created
 */
router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const groupId = req.body?.groupId;
    const serviceFee = Number(req.body?.serviceFee ?? 0);
    const total = Number(req.body?.total ?? 0);

    // FIX: раньше при создании сессии с groupId проверялось только существование группы,
    // но не членство текущего пользователя. Любой авторизованный юзер мог создавать
    // сессии в чужих группах, зная groupId. Теперь — проверка owner || member.
    if (groupId != null) {
      const gid = Number(groupId);
      if (!Number.isFinite(gid))
        return res.status(400).json({ error: "Invalid groupId" });
      const group = await prisma.group.findUnique({
        where: { id: gid },
        select: { ownerId: true, members: { where: { userId: req.user.id }, select: { userId: true } } },
      });
      if (!group)
        return res.status(404).json({ error: "Group not found" });
      const isMember = group.ownerId === req.user.id || group.members.length > 0;
      if (!isMember)
        return res.status(403).json({ error: "You are not a member of this group" });
    }

    const created = await prisma.session.create({
      data: {
        creatorId: req.user.id,
        groupId: groupId != null ? Number(groupId) : null,
        serviceFee: serviceFee || 0,
        total: total || 0,
      },
    });
    console.log("/sessions create:", {
      id: created.id,
      groupId: created.groupId,
    });
    return res.json(created);
  } catch (err) {
    console.error("POST /sessions error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /sessions:
 *   get:
 *     summary: List sessions (by group or personal created)
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: groupId
 *         schema:
 *           type: integer
 *         required: false
 *     responses:
 *       200:
 *         description: Sessions list
 */
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const groupId =
      req.query.groupId != null ? Number(req.query.groupId) : undefined;

    // FIX: аналогично POST — при GET /sessions?groupId=X любой авторизованный юзер
    // мог получить список сессий чужой группы. Теперь требуется членство.
    if (groupId && Number.isFinite(groupId)) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { ownerId: true, members: { where: { userId: req.user.id }, select: { userId: true } } },
      });
      if (!group) return res.status(404).json({ error: "Group not found" });
      const isMember = group.ownerId === req.user.id || group.members.length > 0;
      if (!isMember) return res.status(403).json({ error: "You are not a member of this group" });
    }

    const where =
      groupId && Number.isFinite(groupId)
        ? { groupId }
        : { creatorId: req.user.id };

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { id: "desc" },
      select: {
        id: true,
        creatorId: true,
        groupId: true,
        total: true,
        serviceFee: true,
        status: true,
        createdAt: true,
      },
    });
    return res.json(sessions);
  } catch (err) {
    console.error("GET /sessions error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /sessions/{sessionId}/close:
 *   patch:
 *     summary: Close a session (creator only)
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         schema:
 *           type: integer
 *         required: true
 *     responses:
 *       200:
 *         description: Session closed
 */
router.patch(
  "/:sessionId/close",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = Number(req.params.sessionId);
      if (!Number.isFinite(sessionId))
        return res.status(400).json({ error: "Invalid sessionId" });
      const s = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { creatorId: true, status: true },
      });
      if (!s) return res.status(404).json({ error: "Session not found" });
      if (s.creatorId !== req.user.id)
        return res.status(403).json({ error: "Forbidden" });

      const updated = await prisma.session.update({
        where: { id: sessionId },
        data: { status: "CLOSED" },
      });
      console.log("/sessions close:", { id: sessionId });
      return res.json(updated);
    } catch (err) {
      console.error("PATCH /sessions/:sessionId/close error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * @swagger
 * /sessions/finalize:
 *   post:
 *     summary: Finalize a session by computing allocations for provided items & participants (purely computational for now)
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, participants, items]
 *             properties:
 *               currency: { type: string, example: "JPY", nullable: true }
 *               sessionId: { type: integer }
 *               sessionName: { type: string }
 *               participants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [uniqueId, username]
 *                   properties:
 *                     uniqueId: { type: string }
 *                     username: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, name, price, quantity, splitMode]
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     price: { type: number }
 *                     quantity: { type: number }
 *                     kind: { type: string, nullable: true }
 *                     splitMode: { type: string, enum: [equal, warikan, count, proportional, excluded] }
 *                     perPersonCount: { type: object, additionalProperties: { type: number } }
 *                     assignedTo: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Finalized allocations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId: { type: integer }
 *                 sessionName: { type: string, nullable: true }
 *                 status: { type: string }
 *                 finalizedAt: { type: string, format: date-time }
 *                 createdAt: { type: string, format: date-time }
 *                 currency: { type: string }
 *                 totals:
 *                   type: object
 *                   properties:
 *                     currency: { type: string }
 *                     grandTotal: { type: number }
 *                     byParticipant:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           uniqueId: { type: string }
 *                           username: { type: string }
 *                           amountOwed: { type: number }
 *                           participantId: { type: string }
 *                           total: { type: number }
 *                     byItem:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           itemId: { type: string }
 *                           name: { type: string }
 *                           total: { type: number }
 *                           kind: { type: string, nullable: true }
 *                 allocations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       itemId: { type: string }
 *                       participantId: { type: string }
 *                       shareAmount: { type: number }
 *                       shareRatio: { type: number, nullable: true }
 *                       shareUnits: { type: number, nullable: true }
 */
router.post(
  "/finalize",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { sessionId, sessionName, participants, items } = req.body || {};
      const currency = normalizeCurrencyCode(req.body?.currency);
      if (!Number.isFinite(Number(sessionId))) {
        return res.status(400).json({ error: "sessionId required" });
      }
      if (!Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ error: "participants array required" });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array required" });
      }

      const session = await prisma.session.findUnique({
        where: { id: Number(sessionId) },
        select: { id: true, creatorId: true, createdAt: true },
      });
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.creatorId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      interface ParticipantInfo {
        uniqueId: string;
        username: string;
      }
      interface ItemInput {
        id: string;
        name: string;
        price?: number;
        unitPrice?: number;
        totalPrice?: number;
        quantity: number;
        kind?: string;
        splitMode?: "equal" | "warikan" | "count" | "proportional" | "excluded";
        perPersonCount?: Record<string, number>;
        assignedTo?: string[];
      }
      const pList: ParticipantInfo[] = participants.map((p: any) => ({
        uniqueId: String(p.uniqueId),
        username: String(p.username || p.uniqueId),
      }));
      const participantIndex = new Map<string, ParticipantInfo>();
      for (const p of pList) participantIndex.set(p.uniqueId, p);

      const allocs: any[] = [];
      const warikanItems: Array<{
        id: string;
        totalMinor: number;
      }> = [];
      const proportionalItems: Array<{
        id: string;
        unitPrice: number;
        quantity: number;
      }> = [];
      const declaredItemTotals = new Map<string, number>();
      const splitModeByItem = new Map<string, string>();
      // We'll derive totals AFTER generating allocations to have a single source of truth.
      const itemMeta = new Map<string, { name: string; kind?: string }>();

      function round2(n: number) {
        return Math.round(n * 100) / 100;
      }

      if (process.env.DEBUG_PARSE === "1") {
        console.log(
          "[finalize] participants=",
          pList.length,
          "items=",
          items.length
        );
      }

      for (const raw of items as ItemInput[]) {
        if (!raw || typeof raw !== "object") continue;
        const { id, name, quantity } = raw;
        // prefer explicit price/unitPrice; else derive from totalPrice/quantity
        let unitPrice = Number(
          raw.price ??
            raw.unitPrice ??
            (raw.totalPrice && quantity
              ? Number(raw.totalPrice) / Number(quantity)
              : NaN)
        );
        const qty = Number(quantity);
        // infer splitMode if missing
        let splitMode: "equal" | "warikan" | "count" | "proportional" | "excluded" | undefined = raw.splitMode;
        if (!splitMode) {
          if (raw.perPersonCount) splitMode = "count";
          else splitMode = "equal";
        }
        if (
          !id ||
          !name ||
          !Number.isFinite(unitPrice) ||
          !Number.isFinite(qty) ||
          qty <= 0
        ) {
          return res
            .status(400)
            .json({ error: `Invalid item fields for id=${id}` });
        }
        if (raw.kind != null) {
          itemMeta.set(id, { name, kind: raw.kind });
        } else {
          itemMeta.set(id, { name });
        }
        declaredItemTotals.set(id, round2(unitPrice * qty));
        splitModeByItem.set(id, splitMode);

        if (splitMode === "excluded") {
          continue;
        }

        if (splitMode === "proportional") {
          proportionalItems.push({ id, unitPrice, quantity: qty });
          continue;
        }

        if (splitMode === "warikan") {
          warikanItems.push({
            id,
            totalMinor: toMinorUnits(unitPrice * qty),
          });
          continue;
        }

        if (splitMode === "count") {
          const counts = raw.perPersonCount || {};
          // Validate participants
          let sumUnits = 0;
          for (const [pid, units] of Object.entries(counts)) {
            if (!participantIndex.has(pid)) {
              return res.status(400).json({
                error: `Unknown participant in perPersonCount: ${pid}`,
              });
            }
            const u = Number(units) || 0;
            if (u < 0)
              return res
                .status(400)
                .json({ error: `Negative units for ${pid}` });
            sumUnits += u;
          }
          if (sumUnits !== qty) {
            return res.status(400).json({
              error: `Sum of perPersonCount (${sumUnits}) must equal quantity (${qty}) for item ${id}`,
            });
          }
          for (const [pid, units] of Object.entries(counts)) {
            const u = Number(units) || 0;
            const shareAmount = round2(u * unitPrice);
            allocs.push({
              itemId: id,
              participantId: pid,
              shareUnits: u,
              shareAmount,
              splitMode,
            });
            // participant totals will be derived later
          }
        } else if (splitMode === "equal") {
          const assigned = Array.isArray(raw.assignedTo) ? raw.assignedTo : [];
          if (assigned.length === 0) {
            return res.status(400).json({
              error: `assignedTo required for equal split item ${id}`,
            });
          }
          const valid = assigned.filter((pid) => participantIndex.has(pid));
          if (valid.length !== assigned.length) {
            return res.status(400).json({
              error: `Unknown participant in assignedTo for item ${id}`,
            });
          }
          const ratio = 1 / valid.length;
          let allocated = 0;
          valid.forEach((pid, idx) => {
            let shareAmount = unitPrice * qty * ratio; // raw
            if (idx === valid.length - 1) {
              // last one gets the remainder to avoid rounding drift
              shareAmount = unitPrice * qty - allocated;
            }
            shareAmount = round2(shareAmount);
            allocated = round2(allocated + shareAmount);
            allocs.push({
              itemId: id,
              participantId: pid,
              shareRatio: ratio,
              shareAmount,
              splitMode,
            });
            // participant totals will be derived later
          });
        } else {
          return res.status(400).json({
            error: `Unsupported splitMode '${splitMode}' for item ${id}`,
          });
        }
      }

      const organizerRecord = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { uniqueId: true },
      });
      const organizerUniqueId =
        organizerRecord?.uniqueId && participantIndex.has(organizerRecord.uniqueId)
          ? organizerRecord.uniqueId
          : pList[0]?.uniqueId;

      if (!organizerUniqueId) {
        return res.status(400).json({ error: "Organizer must be included in participants" });
      }

      if (warikanItems.length > 0) {
        allocs.push(
          ...buildWarikanAllocations({
            items: warikanItems,
            participantIds: pList.map((participant) => participant.uniqueId),
            organizerId: organizerUniqueId,
          })
        );
      }

      if (proportionalItems.length > 0) {
        const baseTotals = new Map<string, number>();
        for (const a of allocs) {
          const pid = a.participantId;
          baseTotals.set(pid, round2((baseTotals.get(pid) || 0) + (Number(a.shareAmount) || 0)));
        }
        const baseGrandTotal = Array.from(baseTotals.values()).reduce((sum, value) => sum + value, 0);

        for (const item of proportionalItems) {
          const itemTotal = round2(item.unitPrice * item.quantity);
          let allocated = 0;
          pList.forEach((participant, idx) => {
            const ratio =
              baseGrandTotal > 0
                ? (baseTotals.get(participant.uniqueId) || 0) / baseGrandTotal
                : 1 / Math.max(1, pList.length);
            let shareAmount = itemTotal * ratio;
            if (idx === pList.length - 1) {
              shareAmount = itemTotal - allocated;
            }
            shareAmount = round2(shareAmount);
            allocated = round2(allocated + shareAmount);
            allocs.push({
              itemId: item.id,
              participantId: participant.uniqueId,
              shareRatio: ratio,
              shareAmount,
              splitMode: "proportional",
            });
          });
        }
      }

      // Derive totals from allocations
      const byItemMap = new Map<
        string,
        { itemId: string; name: string; total: number; kind?: string; splitMode?: string; excluded?: boolean }
      >();
      for (const [itemId, total] of declaredItemTotals) {
        const meta = itemMeta.get(itemId);
        const splitMode = splitModeByItem.get(itemId);
        if (splitMode === "excluded") {
          byItemMap.set(itemId, {
            itemId,
            name: meta?.name || itemId,
            total,
            ...(meta?.kind ? { kind: meta.kind } : {}),
            splitMode,
            excluded: true,
          });
        }
      }
      const byParticipantTotals = new Map<string, number>();
      for (const a of allocs) {
        const itemId = a.itemId;
        const shareAmount = Number(a.shareAmount) || 0;
        if (!byItemMap.has(itemId)) {
          const meta = itemMeta.get(itemId);
          const itemSplitMode = splitModeByItem.get(itemId);
          byItemMap.set(itemId, {
            itemId,
            name: meta?.name || itemId,
            total: 0,
            ...(meta?.kind ? { kind: meta.kind } : {}),
            ...(itemSplitMode ? { splitMode: itemSplitMode } : {}),
          });
        }
        const entry = byItemMap.get(itemId)!;
        entry.total = round2(entry.total + shareAmount);
        const pid = a.participantId;
        byParticipantTotals.set(
          pid,
          round2((byParticipantTotals.get(pid) || 0) + shareAmount)
        );
      }
      const byItem = Array.from(byItemMap.values());
      const grandTotal = round2(byItem.reduce((s, it) => s + it.total, 0));
      const byParticipant = pList.map((p) => {
        const amount = round2(byParticipantTotals.get(p.uniqueId) || 0);
        return {
          uniqueId: p.uniqueId,
          username: p.username,
          amountOwed: amount,
          participantId: p.uniqueId,
          total: amount,
        };
      });
      if (process.env.DEBUG_PARSE === "1") {
        console.log("[finalize] derived byItem=", byItem);
        console.log("[finalize] derived byParticipant=", byParticipant);
      }

      const createdAtIso = session.createdAt.toISOString();
      const finalizedAt = new Date();
      const finalizedAtIso = finalizedAt.toISOString();
      const responsePayload = {
        sessionId: Number(sessionId),
        sessionName: sessionName || null,
        status: "finalized",
        createdAt: createdAtIso,
        finalizedAt: finalizedAtIso,
        currency,
        totals: {
          currency,
          grandTotal,
          byParticipant,
          byItem,
        },
        allocations: allocs,
      } satisfies Record<string, unknown>;

      const participantUniqueIds = Array.from(
        new Set(byParticipant.map((p) => p.uniqueId))
      ).sort();

      await prisma.sessionHistoryEntry.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          creatorId: session.creatorId,
          sessionName: sessionName ?? null,
          payload: responsePayload as Prisma.JsonObject,
          participantUniqueIds,
          grandTotal: grandTotal.toString(),
          currency,
          finalizedAt,
        },
        update: {
          sessionName: sessionName ?? null,
          payload: responsePayload as Prisma.JsonObject,
          participantUniqueIds,
          grandTotal: grandTotal.toString(),
          currency,
          finalizedAt,
        },
      });

      const participantUsers = await prisma.user.findMany({
        where: { uniqueId: { in: participantUniqueIds } },
        select: { id: true, uniqueId: true },
      });
      const creatorUser = await prisma.user.findUnique({
        where: { id: session.creatorId },
        select: { username: true },
      });
      const displayName = sessionName || "a bill";
      const owedByParticipant = new Map(
        byParticipant.map((participant) => [
          participant.uniqueId,
          round2(Number(participant.amountOwed) || 0),
        ])
      );
      for (const pu of participantUsers) {
        if (pu.id !== session.creatorId) {
          const owed = owedByParticipant.get(pu.uniqueId) || 0;
          if (owed > 0) continue;
          createNotification(
            pu.id,
            "SESSION_FINALIZED",
            "Bill finalized",
            `${creatorUser?.username ?? "Someone"} finalized "${displayName}" — ${currency} ${grandTotal}`,
            {
              sessionId: session.id,
              sessionName: displayName,
              currency,
              grandTotal,
              creatorUsername: creatorUser?.username ?? "Someone",
            }
          );
        }
      }

      for (const p of byParticipant) {
        const owed = round2(Number(p.amountOwed) || 0);
        if (owed <= 0) continue;
        const pu = participantUsers.find((u) => u.uniqueId === p.uniqueId);
        if (!pu) continue;
        createNotification(
          pu.id,
          "DEBT_REMINDER",
          "Amount to pay",
          `You owe ${currency} ${owed} for "${displayName}"`,
          {
            sessionId: session.id,
            sessionName: displayName,
            amountOwed: owed,
            currency,
            participantUniqueId: p.uniqueId,
          }
        );
      }

      return res.json(responsePayload);
    } catch (err) {
      console.error("POST /sessions/finalize error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * @swagger
 * /sessions/history:
 *   get:
 *     summary: Session finalize history for the current user
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: all
 *         schema:
 *           type: boolean
 *         description: Return full history when true (defaults to latest 5)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Override default result size when not requesting all
 *     responses:
 *       200:
 *         description: Session history entries
 */
router.get(
  "/history",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const requesterId = req.user.id;

      const userRecord = await prisma.user.findUnique({
        where: { id: requesterId },
        select: { uniqueId: true },
      });
      if (!userRecord) {
        return res.status(404).json({ error: "User not found" });
      }

      const allParam = String(req.query.all ?? "").toLowerCase();
      const fetchAll = allParam === "1" || allParam === "true";

      let limit = 5;
      if (!fetchAll && req.query.limit != null) {
        const parsed = Number(req.query.limit);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return res
            .status(400)
            .json({ error: "limit must be a positive integer" });
        }
        limit = Math.min(Math.trunc(parsed), 50);
      }

      const filters: Prisma.SessionHistoryEntryWhereInput[] = [
        { creatorId: requesterId },
      ];
      if (userRecord.uniqueId) {
        filters.push({ participantUniqueIds: { has: userRecord.uniqueId } });
      }
      const whereFilter: Prisma.SessionHistoryEntryWhereInput =
        filters.length > 1 ? { OR: filters } : filters[0]!;

      const entries = await prisma.sessionHistoryEntry.findMany({
        where: whereFilter,
        orderBy: { finalizedAt: "desc" },
        ...(fetchAll ? {} : { take: limit }),
      });

      const response = entries.map((entry) => ({
        sessionId: entry.sessionId,
        sessionName: entry.sessionName,
        finalizedAt: entry.finalizedAt.toISOString(),
        grandTotal: entry.grandTotal.toNumber(),
        currency: entry.currency,
        participantUniqueIds: entry.participantUniqueIds,
        isCreator: entry.creatorId === requesterId,
        payload: entry.payload,
      }));

      return res.json({
        scope: fetchAll ? "all" : "latest",
        count: response.length,
        limit: fetchAll ? null : limit,
        entries: response,
      });
    } catch (err) {
      console.error("GET /sessions/history error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.patch(
  "/history/:sessionId/payments",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const requesterId = req.user.id;
      const sessionId = Number(req.params.sessionId);
      if (!Number.isFinite(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: "Invalid sessionId" });
      }

      const { participantUniqueId, paid } = req.body ?? {};
      if (
        typeof participantUniqueId !== "string" ||
        participantUniqueId.trim().length === 0
      ) {
        return res
          .status(400)
          .json({ error: "participantUniqueId is required" });
      }
      if (typeof paid !== "boolean") {
        return res.status(400).json({ error: "paid must be a boolean" });
      }

      const userRecord = await prisma.user.findUnique({
        where: { id: requesterId },
        select: { uniqueId: true, username: true },
      });
      if (!userRecord?.uniqueId) {
        return res.status(404).json({ error: "User not found" });
      }

      const entry = await prisma.sessionHistoryEntry.findUnique({
        where: { sessionId },
      });
      if (!entry) {
        return res.status(404).json({ error: "History entry not found" });
      }

      const canAccess =
        entry.creatorId === requesterId ||
        entry.participantUniqueIds.includes(userRecord.uniqueId);
      if (!canAccess) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const payload =
        (entry.payload as Record<string, unknown> | null) ?? {};
      const existingStatus =
        (payload.paymentStatus as Record<
          string,
          { paid: boolean; paidAt?: string | null }
        >) ?? {};

      const nextStatus = {
        ...existingStatus,
        [participantUniqueId]: {
          paid,
          paidAt: paid ? new Date().toISOString() : null,
        },
      };

      const updatedPayload = {
        ...payload,
        paymentStatus: nextStatus,
      };

      await prisma.sessionHistoryEntry.update({
        where: { sessionId },
        data: { payload: updatedPayload as Prisma.JsonObject },
      });

      if (paid && entry.creatorId !== requesterId) {
        const target = await prisma.user.findFirst({
          where: {
            uniqueId: participantUniqueId,
          },
          select: { username: true },
        });
        createNotification(
          entry.creatorId,
          "PAYMENT_MARKED",
          "Payment marked",
          `${target?.username ?? userRecord.username ?? "Someone"} marked paid for "${entry.sessionName ?? "a bill"}"`,
          {
            sessionId,
            sessionName: entry.sessionName ?? "a bill",
            participantUniqueId,
            participantUsername:
              target?.username ?? userRecord.username ?? "Someone",
          }
        );
      }

      return res.json({
        sessionId,
        paymentStatus: nextStatus,
      });
    } catch (err) {
      console.error("PATCH /sessions/history/:sessionId/payments error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

export default router;
