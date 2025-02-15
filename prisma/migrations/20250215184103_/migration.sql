/*
  Warnings:

  - You are about to drop the `Decision` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "choices" DROP CONSTRAINT "choices_decision_id_fkey";

-- DropForeignKey
ALTER TABLE "comparisons" DROP CONSTRAINT "comparisons_decision_id_fkey";

-- DropTable
DROP TABLE "Decision";

-- CreateTable
CREATE TABLE "decisions" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "globalAlpha" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "globalBeta" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "choices" ADD CONSTRAINT "choices_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
