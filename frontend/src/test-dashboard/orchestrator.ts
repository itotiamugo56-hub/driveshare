import { TestContext, freshContext } from './ctx';
import { useTestRunStore } from '../store/testRunStore';
import { info } from './helpers';

import { runAuth } from './runners/01-auth';
import { runIdentity } from './runners/02-identity';
import { runTrust } from './runners/03-trust';
import { runVehicleListing } from './runners/04-vehicleListing';
import { runAccessIot } from './runners/05-accessIot';
import { runSecurityCompliance } from './runners/06-securityCompliance';
import { runPayments } from './runners/07-payments';
import { runFraud } from './runners/08-fraud';
import { runInsurance } from './runners/09-insurance';
import { runDispute } from './runners/10-dispute';
import { runPricing } from './runners/11-pricing';
import { runLogistics } from './runners/12-logistics';
import { runReviews } from './runners/13-reviews';
import { runAdminOps } from './runners/14-adminOps';
import { runCompanyProfile } from './runners/15-companyProfile';

export interface DomainRunner {
  key: string;
  label: string;
  /** True if this runner can only sensibly run after earlier ones have populated ctx. */
  requiresPriorContext: boolean;
  run: (ctx: TestContext) => Promise<void>;
}

export const DOMAIN_RUNNERS: DomainRunner[] = [
  { key: 'auth', label: '1. Auth', requiresPriorContext: false, run: runAuth },
  { key: 'identity', label: '2. Identity & Verification', requiresPriorContext: true, run: runIdentity },
  { key: 'trust', label: '3. Trust Score', requiresPriorContext: true, run: runTrust },
  { key: 'vehicleListing', label: '4. Vehicle & Listing', requiresPriorContext: true, run: runVehicleListing },
  { key: 'accessIot', label: '5. Access & IoT', requiresPriorContext: true, run: runAccessIot },
  { key: 'securityCompliance', label: '6. Data Security & Compliance', requiresPriorContext: true, run: runSecurityCompliance },
  { key: 'payments', label: '7. Payments & Escrow', requiresPriorContext: true, run: runPayments },
  { key: 'fraud', label: '8. Fraud Detection', requiresPriorContext: true, run: runFraud },
  { key: 'insurance', label: '9. Insurance & Liability', requiresPriorContext: true, run: runInsurance },
  { key: 'dispute', label: '10. Dispute Resolution', requiresPriorContext: true, run: runDispute },
  { key: 'pricing', label: '11. Pricing Engine', requiresPriorContext: true, run: runPricing },
  { key: 'logistics', label: '12. Logistics & Fleet', requiresPriorContext: true, run: runLogistics },
  { key: 'reviews', label: '13. Reviews & Reputation', requiresPriorContext: true, run: runReviews },
  { key: 'adminOps', label: '14. Admin & Operations', requiresPriorContext: true, run: runAdminOps },
  // Added per the verification-check follow-up ("company/business profile" gap) —
  // not one of the original 14 smoke-test.ps1 sections at the time that script
  // was written, appended as Section 15 there and mirrored here.
  { key: 'companyProfile', label: '15. Company Profile', requiresPriorContext: true, run: runCompanyProfile },
];

let sharedContext: TestContext = freshContext();

export function getContext() {
  return sharedContext;
}

export function resetContext() {
  sharedContext = freshContext();
  useTestRunStore.getState().reset();
}

async function guarded(fn: () => Promise<void>, label: string) {
  try {
    await fn();
  } catch (e: any) {
    useTestRunStore.getState().addEntry({
      level: 'fail',
      domain: label,
      message: 'Runner threw an unexpected exception (see details)',
      details: e?.message ?? String(e),
    });
  }
}

/** Runs every domain in the same order as smoke-test.ps1, sharing one context throughout. */
export async function runFullSuite() {
  const store = useTestRunStore.getState();
  store.setRunning(true);
  info('Starting full suite run — mirrors smoke-test.ps1 sections 1 through 15 in order.');
  for (const runner of DOMAIN_RUNNERS) {
    // eslint-disable-next-line no-await-in-loop
    await guarded(() => runner.run(sharedContext), runner.label);
  }
  info('Full suite run complete.');
  useTestRunStore.getState().setRunning(false);
}

/**
 * Runs a single domain against whatever context already exists (tokens/IDs from
 * earlier runs in this session). If the domain needs prior context that hasn't
 * been established yet (e.g. running "Payments" before "Auth"), it will fail
 * loudly and specifically rather than silently no-op — exactly like trying to
 * run a later section of smoke-test.ps1 in isolation would.
 */
export async function runSingleDomain(key: string) {
  const runner = DOMAIN_RUNNERS.find((r) => r.key === key);
  if (!runner) return;
  const store = useTestRunStore.getState();
  store.setRunning(true);
  if (runner.requiresPriorContext && !sharedContext.ownerToken) {
    info(`Running "${runner.label}" without prior context — auto-running Auth first, exactly as a fresh smoke-test.ps1 invocation would.`);
    await guarded(() => runAuth(sharedContext), '1. Auth');
  }
  await guarded(() => runner.run(sharedContext), runner.label);
  store.setRunning(false);
}
