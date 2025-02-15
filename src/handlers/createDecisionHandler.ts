import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

export const createDecisionHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { title, choices: choicesText, requiredComparisonsPerPair } = req.body;

  // Validate that there is an array of at least two choices.
  if (!choicesText || !Array.isArray(choicesText) || choicesText.length < 2) {
    console.warn(
      `${new Date().toISOString()} - createDecisionHandler - Invalid or insufficient choices in request body`
    );
    res.status(400).json({ error: "At least two choices are required." });
    return;
  }

  // Validate requiredComparisonsPerPair is a positive integer; default to 1 if not provided.
  const reqComp = parseInt(requiredComparisonsPerPair, 10);
  const comparisonsPerPair = !isNaN(reqComp) && reqComp > 0 ? reqComp : 1;

  try {
    const decisionId = uuidv4();
    const decision = await prisma.decision.create({
      data: {
        title: title,
        choices: {
          create: choicesText.map((text: string) => ({ text })),
        },
      },
      include: { choices: true },
    });

    console.info(
      `${new Date().toISOString()} - createDecisionHandler - Decision created successfully. Decision ID: ${
        decision.id
      }, Title: ${title}, Choices: ${choicesText}, Required Comparisons per Pair: ${comparisonsPerPair}`
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
