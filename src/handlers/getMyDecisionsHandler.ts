import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DecisionType = "voted" | "created" | "all";

export const getMyDecisionsHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.dbUser.id;
  const type = (req.query.type as DecisionType) || "all";

  try {
    let decisions;

    switch (type) {
      case "voted":
        // Get decisions where user has voted
        decisions = await prisma.decision.findMany({
          where: {
            comparisons: {
              some: {
                userId,
              },
            },
          },
          include: {
            choices: {
              select: {
                id: true,
                text: true,
              },
            },
            _count: {
              select: {
                choices: true,
                comparisons: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        break;

      case "created":
        // Get decisions created by user
        decisions = await prisma.decision.findMany({
          where: {
            createdBy: userId,
          },
          include: {
            choices: {
              select: {
                id: true,
                text: true,
              },
            },
            _count: {
              select: {
                choices: true,
                comparisons: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        break;

      default:
        // Get all decisions related to user (both voted and created)
        decisions = await prisma.decision.findMany({
          where: {
            OR: [
              {
                comparisons: {
                  some: {
                    userId,
                  },
                },
              },
              {
                createdBy: userId,
              },
            ],
          },
          include: {
            choices: {
              select: {
                id: true,
                text: true,
              },
            },
            _count: {
              select: {
                choices: true,
                comparisons: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
    }

    res.status(200).json({
      decisions: decisions.map((decision) => ({
        id: decision.id,
        title: decision.title,
        createdAt: decision.createdAt,
        choicesCount: decision._count.choices,
        choices: decision.choices,
      })),
    });
  } catch (error) {
    console.error("Get my decisions error:", error);
    res.status(500).json({ error: "Failed to fetch decisions" });
  }
};
