import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Oe } from '../oe/oe.entity';

/**
 * Modulo de banco de dados do DNLog.
 *
 * Aqui ficam persistidas as Ordens de Embarque (OE) — antes elas viviam
 * apenas no localStorage do navegador (uma copia por maquina). Com o banco,
 * o servidor passa a ser a fonte da verdade e todos os usuarios (operador,
 * conferente, gestor) enxergam as mesmas OEs.
 *
 * O driver e escolhido pelo .env (DB_TYPE):
 *   - sqlite   (padrao): arquivo local data/dnlog.db. Zero instalacao, ideal
 *              para desenvolvimento e demonstracao na maquina do Gabriel.
 *   - postgres: banco PostgreSQL hospedado (SkyOne) para producao.
 *
 * synchronize=true cria/atualiza as tabelas automaticamente a partir das
 * entidades — pratico no prototipo. Em producao com Postgres, troque para
 * migrations (DB_SYNCHRONIZE=false) para nao alterar o schema sem controle.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('DatabaseModule');
        const type = (config.get<string>('DB_TYPE') || 'sqlite').toLowerCase();
        // synchronize liga sozinho em sqlite (dev); em postgres exige opt-in.
        const synchronize =
          config.get<string>('DB_SYNCHRONIZE') === 'true' || type === 'sqlite';

        if (type === 'postgres') {
          // schema dedicado (ex.: 'dnlog') permite compartilhar o MESMO banco
          // Supabase com outros apps (QC) sem colisão de tabelas. Padrão: public.
          const schema = config.get<string>('DB_SCHEMA') || 'public';
          logger.log(`Banco: PostgreSQL (schema: ${schema})`);
          return {
            type: 'postgres' as const,
            host: config.get<string>('DB_HOST') || 'localhost',
            port: parseInt(config.get<string>('DB_PORT') || '5432', 10),
            username: config.get<string>('DB_USERNAME') || 'dnlog',
            password: config.get<string>('DB_PASSWORD') || '',
            database: config.get<string>('DB_NAME') || 'dnlog',
            schema,
            ssl:
              config.get<string>('DB_SSL') === 'true'
                ? { rejectUnauthorized: false }
                : false,
            entities: [Oe],
            synchronize,
            autoLoadEntities: true,
          };
        }

        // Padrao: SQLite em arquivo (data/dnlog.db).
        const database = config.get<string>('DB_DATABASE') || 'data/dnlog.db';
        logger.log(`Banco: SQLite (${database})`);
        return {
          type: 'better-sqlite3' as const,
          database,
          entities: [Oe],
          synchronize,
          autoLoadEntities: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
