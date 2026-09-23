import data from "@/data/hosted-models.json";
import type { ApiPricing } from "@/lib/api-cost";

export interface HostedModel {
  id: string;
  name: string;
  provider: string;
  providerModelId: string;
  sourceUrl: string;
  verifiedAt: string;
  accessNote: string;
  pricing: ApiPricing | null;
}

const hostedModels: HostedModel[] = data;
export { hostedModels };
