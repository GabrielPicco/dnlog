import { SetMetadata } from '@nestjs/common';

/** Marca uma rota como pública (sem exigir API key). Ex.: health check. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
