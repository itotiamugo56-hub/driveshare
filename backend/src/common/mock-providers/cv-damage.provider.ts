import { Injectable, Logger } from '@nestjs/common';
import { isMockMode } from './provider-mode';

export interface DamageAnnotation {
  boundingBox: [number, number, number, number];
  classification: string;
  confidence: number;
}

@Injectable()
export class CvDamageProvider {
  private readonly logger = new Logger('CvDamageProvider(MOCK)');

  async analyzeCondition(_mediaAssetRefs: string[]): Promise<{ annotations: DamageAnnotation[]; MOCKED: boolean }> {
    if (isMockMode('CV_DAMAGE_MODEL_MODE')) {
      this.logger.warn('MOCKED computer-vision damage analysis — no live CV model endpoint configured');
      return { annotations: [], MOCKED: true };
    }
    throw new Error('Live CV damage-detection model not configured.');
  }

  /** Compares a pre-trip and post-trip baseline to flag NEW damage only. */
  async compareBaselines(
    preAnnotations: DamageAnnotation[],
    postAnnotations: DamageAnnotation[],
  ): Promise<{ newDamageDetected: boolean; diffs: DamageAnnotation[]; MOCKED: boolean }> {
    if (isMockMode('CV_DAMAGE_MODEL_MODE')) {
      this.logger.warn('MOCKED baseline comparison');
      const preSet = new Set(preAnnotations.map((a) => a.classification));
      const diffs = postAnnotations.filter((a) => !preSet.has(a.classification));
      return { newDamageDetected: diffs.length > 0, diffs, MOCKED: true };
    }
    throw new Error('Live CV damage-detection model not configured.');
  }
}
