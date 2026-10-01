import { Global, Module } from '@nestjs/common';
import { IdVerificationProvider } from './id-verification.provider';
import { DmvProvider } from './dmv.provider';
import { DrivingHistoryProvider } from './driving-history.provider';
import { PaymentProcessorProvider } from './payment-processor.provider';
import { InsuranceCarrierProvider } from './insurance-carrier.provider';
import { TelematicsProvider } from './telematics.provider';
import { CvDamageProvider } from './cv-damage.provider';
import { VinDecodeProvider } from './vin-decode.provider';
import { EventDataFeedProvider } from './event-data-feed.provider';
import { KmsProvider } from './kms.provider';
import { PhotoStorageProvider } from './photo-storage.provider';

const providers = [
  IdVerificationProvider,
  DmvProvider,
  DrivingHistoryProvider,
  PaymentProcessorProvider,
  InsuranceCarrierProvider,
  TelematicsProvider,
  CvDamageProvider,
  VinDecodeProvider,
  EventDataFeedProvider,
  KmsProvider,
  PhotoStorageProvider,
];

@Global()
@Module({
  providers,
  exports: providers,
})
export class MockProvidersModule {}
