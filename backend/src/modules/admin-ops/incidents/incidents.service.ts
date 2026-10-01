import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventBusService } from '../../../common/event-bus/event-bus.service';
import { EVT } from '../../../common/enums';
import { AdminAuditService } from '../admin-audit.service';
import { AlertFiring } from '@prisma/client';

@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService, private events: EventBusService, private audit: AdminAuditService) {}

  async createIncident(actorId: string, title: string, severity: string, description: string, affectedServices: string[]) {
    const incident = await this.prisma.incident.create({
      data: { title, severity: severity as any, description, affectedServices, createdBy: actorId },
    });
    await this.audit.log(actorId, 'admin', 'create_incident', 'incident', incident.id, title);
    this.events.publish(EVT.ADMIN_INCIDENT_OPENED, { incidentId: incident.id, severity });
    return incident;
  }

  async listIncidents(status?: string) {
    return this.prisma.incident.findMany({ where: status ? { status: status as any } : {}, orderBy: { createdAt: 'desc' } });
  }

  async getIncident(id: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async updateStatus(actorId: string, id: string, status: string) {
    const incident = await this.prisma.incident.update({
      where: { id },
      data: { status: status as any, resolvedAt: status === 'resolved' ? new Date() : null },
    });
    await this.audit.log(actorId, 'admin', 'update_incident_status', 'incident', id, status);
    if (status === 'resolved') this.events.publish(EVT.ADMIN_INCIDENT_RESOLVED, { incidentId: id });
    return incident;
  }

  async createAlertRule(name: string, metric: string, comparator: string, threshold: number, notifyChannel: string) {
    return this.prisma.alertRule.create({ data: { name, metric, comparator: comparator as any, threshold, notifyChannel } });
  }

  async listAlertRules() {
    return this.prisma.alertRule.findMany();
  }

  async toggleAlertRule(id: string, enabled: boolean) {
    return this.prisma.alertRule.update({ where: { id }, data: { enabled } });
  }

  /**
   * Evaluates every enabled alert rule against the given metric snapshot
   * (produced by the Monitoring service). Kept as an explicit method so the
   * Monitoring feeds and the alert-firing logic stay independently testable —
   * a real deployment would wire this into a periodic scheduled job.
   */
  async evaluateMetrics(metricSnapshot: Record<string, number>) {
    const rules = await this.prisma.alertRule.findMany({ where: { enabled: true } });
    const fired: AlertFiring[] = [];
    for (const rule of rules) {
      const value = metricSnapshot[rule.metric];
      if (value === undefined) continue;
      const triggered =
        (rule.comparator === 'gt' && value > rule.threshold) ||
        (rule.comparator === 'gte' && value >= rule.threshold) ||
        (rule.comparator === 'lt' && value < rule.threshold) ||
        (rule.comparator === 'lte' && value <= rule.threshold);
      if (triggered) {
        const firing = await this.prisma.alertFiring.create({ data: { alertRuleId: rule.id, observedValue: value } });
        this.events.publish(EVT.ADMIN_ALERT_FIRED, { ruleId: rule.id, name: rule.name, value, channel: rule.notifyChannel });
        fired.push(firing);
      }
    }
    return { evaluatedRules: rules.length, fired };
  }

  async listFirings(acknowledged?: boolean) {
    return this.prisma.alertFiring.findMany({
      where: acknowledged === undefined ? {} : acknowledged ? { acknowledgedAt: { not: null } } : { acknowledgedAt: null },
      orderBy: { firedAt: 'desc' },
    });
  }

  async acknowledgeFiring(actorId: string, firingId: string) {
    return this.prisma.alertFiring.update({ where: { id: firingId }, data: { acknowledgedAt: new Date(), acknowledgedBy: actorId } });
  }
}