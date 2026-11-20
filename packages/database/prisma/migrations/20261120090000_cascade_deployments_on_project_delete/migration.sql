-- DropForeignKey
ALTER TABLE "Deployment" DROP CONSTRAINT "Deployment_projectId_fkey";

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
