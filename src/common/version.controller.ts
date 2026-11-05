import { Controller, Get } from '@nestjs/common';
import { API_VERSION } from './app-version.js';
import { Public } from './decorators.js';
import { minPosVersion } from './pos-version.js';

// Público: el panel la muestra incluso antes de iniciar sesión. Solo números de versión, nada más.
@Controller('version')
export class VersionController {
  @Public()
  @Get()
  version() {
    return { api: API_VERSION, minPosVersion: minPosVersion() };
  }
}
