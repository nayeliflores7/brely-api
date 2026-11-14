import { Controller, Get } from '@nestjs/common';
import { API_ENV, API_VERSION } from './app-version.js';
import { Public } from './decorators.js';
import { minPosVersion } from './pos-version.js';

// Público: el panel la muestra incluso antes de iniciar sesión. Solo la versión y el ambiente, nada más.
@Controller('version')
export class VersionController {
  @Public()
  @Get()
  version() {
    return { api: API_VERSION, env: API_ENV, minPosVersion: minPosVersion() };
  }
}
