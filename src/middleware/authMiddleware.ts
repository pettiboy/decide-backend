import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import admin from "../config/firebase";

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    dbUser: {
      id: string;
      email: string | null;
      createdAt: Date;
    };
  };
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Get or create user in database
    const dbUser = await prisma.user.upsert({
      where: { id: decodedToken.uid },
      update: {},
      create: {
        id: decodedToken.uid,
        email: decodedToken.email || null,
      },
    });

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      dbUser,
    };

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(401).json({ error: "Unauthorized" });
  }
};
