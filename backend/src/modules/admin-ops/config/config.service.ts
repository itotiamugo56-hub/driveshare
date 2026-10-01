import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventBusService } from '../../../common/event-bus/event-bus.service';
import { EVT } from '../../../common/enums';
import { AdminAuditService } from '../admin-audit.service';

const DEFAULT_TRUST_WEIGHTS = { verification: 0.3, tripHistory: 0.2, behavior: 0.25, disputes: 0.15, fraud: 0.1 };

@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService, private events: EventBusService, private audit: AdminAuditService) {}

  async getConfig(key: string) {
    const setting = await this.prisma.configSetting.findUnique({ where: { key } });
    if (!setting) {
      // Sensible defaults for known config keys so the platform behaves correctly before any admin touches it.
      if (key === 'trust_score.weights') return { key, value: DEFAULT_TRUST_WEIGHTS };
      throw new NotFoundException(`No config set for key "${key}"`);
    }
    return setting;
  }

  async setConfig(actorId: string, key: string, value: any) {
    const updated = await this.prisma.configSetting.upsert({
      where: { key },
      update: { value, updatedBy: actorId },
      create: { key, value, updatedBy: actorId },
    });
    await this.audit.log(actorId, 'admin', 'set_config', 'config_setting', key, undefined, { value });
    this.events.publish(EVT.ADMIN_CONFIG_CHANGED, { key, value });
    return updated;
  }

  async listConfig() {
    return this.prisma.configSetting.findMany();
  }

  async getFlag(key: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    return flag ?? { key, enabled: false, scopeRegion: null, description: 'Not explicitly set — defaults to disabled' };
  }

  async setFlag(actorId: string, key: string, enabled: boolean, scopeRegion?: string, description?: string) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: { enabled, scopeRegion, description, updatedBy: actorId },
      create: { key, enabled, scopeRegion, description, updatedBy: actorId },
    });
    await this.audit.log(actorId, 'admin', 'set_feature_flag', 'feature_flag', key, undefined, { enabled, scopeRegion });
    this.events.publish(EVT.ADMIN_FEATURE_FLAG_CHANGED, { key, enabled, scopeRegion });
    return flag;
  }

  async listFlags() {
    return this.prisma.featureFlag.findMany();
  }

  /** Proxies to the Pricing Engine's surge-cap store (Section 10) — kept in that domain's own table since it's pricing-specific. */
  async setSurgeCap(actorId: string, marketRegion: string, maxMultiplier: number) {
    const updated = await this.prisma.surgeCapPolicy.upsert({
      where: { marketRegion },
      update: { maxMultiplier },
      create: { marketRegion, maxMultiplier },
    });
    await this.audit.log(actorId, 'admin', 'set_surge_cap', 'surge_cap_policy', marketRegion, undefined, { maxMultiplier });
    return updated;
  }
}
