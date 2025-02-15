import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "middleware/authMiddleware";

const prisma = new PrismaClient();

export const createDecisionHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { title, choices: choicesText } = req.body;
  const userId = req.user!.dbUser.id;

  // Validate that there is an array of at least two choices.
  if (!choicesText || !Array.isArray(choicesText) || choicesText.length < 2) {
    console.warn(
      `${new Date().toISOString()} - createDecisionHandler - Invalid or insufficient choices in request body`
    );
    res.status(400).json({ error: "At least two choices are required." });
    return;
  }

  try {
    const decision = await prisma.decision.create({
      data: {
        title: title,
        createdBy: userId,
        choices: {
          create: choicesText.map((text: string) => ({ text })),
        },
      },
      include: { choices: true },
    });

    console.info(
      `${new Date().toISOString()} - createDecisionHandler - Decision created successfully. Decision ID: ${
        decision.id
      }, Title: ${title}, Choices: ${choicesText}`
    );
    res.status(201).json({ decisionId: decision.id });
  } catch (error) {
    console.error(
      `${new Date().toISOString()} - createDecisionHandler - Error creating decision`,
      error
    );
    res.status(500).json({ error: "Failed to create decision." });
  }
};
