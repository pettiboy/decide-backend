/*
  Warnings:

  - You are about to drop the `ranked_choices` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[choice1_id,choice2_id,user_id]` on the table `comparisons` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ranked_choices" DROP CONSTRAINT "ranked_choices_choice_id_fkey";

-- DropForeignKey
ALTER TABLE "ranked_choices" DROP CONSTRAINT "ranked_choices_decision_id_fkey";

-- DropIndex
DROP INDEX "comparisons_decision_id_user_id_key";

-- DropTable
DROP TABLE "ranked_choices";

-- CreateIndex
CREATE UNIQUE INDEX "comparisons_choice1_id_choice2_id_user_id_key" ON "comparisons"("choice1_id", "choice2_id", "user_id");
