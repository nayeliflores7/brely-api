import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { SuperAdmin, SuperAdminDocument } from './schemas/super-admin.schema.js';

@Injectable()
export class SuperAdminsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminsService.name);

  constructor(
    @InjectModel(SuperAdmin.name) private readonly model: Model<SuperAdminDocument>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    if (await this.model.estimatedDocumentCount()) return;

    const email = this.config.get<string>('SUPERADMIN_EMAIL');
    const password = this.config.get<string>('SUPERADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn('No super admin exists and SUPERADMIN_EMAIL/PASSWORD are not set');
      return;
    }
    await this.model.create({
      fullName: this.config.get<string>('SUPERADMIN_NAME') ?? 'Super Admin',
      email,
      passwordHash: await argon2.hash(password),
    });
    this.logger.log(`Super admin created: ${email}`);
  }

  async resetPassword(id: string, passwordHash: string) {
    await this.model.updateOne({ _id: id, active: true }, { passwordHash, sessionsValidFrom: new Date() });
  }

  findByEmailForLogin(email: string) {
    return this.model
      .findOne({ email: email.toLowerCase(), active: true })
      .select('+passwordHash')
      .lean();
  }

  findForPassword(id: string) {
    return this.model.findOne({ _id: id, active: true }).select('+passwordHash').lean();
  }

  async setPassword(id: string, passwordHash: string) {
    await this.model.updateOne({ _id: id, active: true }, { passwordHash });
  }

  findActiveById(id: string) {
    return this.model.findOne({ _id: id, active: true }).select('+sessionsValidFrom').lean();
  }

  async emailExists(email: string) {
    return !!(await this.model.exists({ email: email.toLowerCase() }));
  }
}