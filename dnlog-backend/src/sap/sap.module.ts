import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SapClientService } from './sap-client.service';
import { SapMockService } from './sap-mock.service';

/**
 * Token de injecao do servico SAP.
 * Permite trocar entre mock e cliente real sem alterar quem usa.
 */
export const SAP_SERVICE = 'SAP_SERVICE';

@Module({
  providers: [
    SapClientService,
    SapMockService,
    {
      provide: SAP_SERVICE,
      useFactory: (config: ConfigService, real: SapClientService, mock: SapMockService) => {
        const useMock = config.get<string>('USE_MOCK') === 'true';
        return useMock ? mock : real;
      },
      inject: [ConfigService, SapClientService, SapMockService],
    },
  ],
  exports: [SAP_SERVICE],
})
export class SapModule {}
