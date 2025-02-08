import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createDecisionHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { choices } = req.body as { choices: string[] };

    if (!choices || !Array.isArray(choices) || choices.length === 0) {
      res
        .status(400)
        .json({
          error:
            "Choices are required and must be a non-empty array of strings.",
        });
      return;
    }

    const decision = await prisma.decision.create({
      data: {
        choices: {
          create: choices.map((text) => ({ text })),
        },
      },
    });

    res.status(201).json({ decisionId: decision.id });
    return;
  } catch (error) {
    console.error("Error creating decision:", error);
    res.status(500).json({ error: "Failed to create decision" });
    return;
  }
};
