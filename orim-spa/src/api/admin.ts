import client from './client';
import type { DeploymentReadiness } from '../types/models';

export async function getDeploymentReadiness(): Promise<DeploymentReadiness> {
  const { data } = await client.get<DeploymentReadiness>('/api/admin/deployment-readiness');
  return data;
}
