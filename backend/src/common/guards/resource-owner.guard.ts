import { Injectable } from '@nestjs/common';

/**
 * Marker service used by controllers/services to perform ownership checks that
 * are resource-specific (e.g. "caller must be the vehicle's ownerId", "caller
 * must be the trip's renterId") rather than pure role checks. Kept as an
 * injectable helper rather than a blanket guard since the resource lookup
 * differs per domain (vehicle vs trip vs listing).
 */
@Injectable()
export class OwnershipCheckService {
  assert(condition: boolean, message = 'Not authorized for this resource'): void {
    if (!condition) {
      const { ForbiddenException } = require('@nestjs/common');
      throw new ForbiddenException(message);
    }
  }
}
