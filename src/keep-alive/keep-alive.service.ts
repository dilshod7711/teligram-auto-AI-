import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  // Runs every 14 minutes to prevent Render free tier from sleeping (it sleeps after 15 min of inactivity)
  @Cron('*/14 * * * *')
  async handleCron() {
    // Render provides RENDER_EXTERNAL_URL automatically.
    // If you are using a different environment variable for your app URL, you can add it here.
    const url = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
    
    if (!url) {
      this.logger.warn('RENDER_EXTERNAL_URL or APP_URL is not set. Cannot ping self to keep alive.');
      return;
    }
    
    try {
      this.logger.log(`Pinging self at ${url} to keep alive...`);
      const response = await fetch(url);
      this.logger.log(`Ping status: ${response.status} ${response.statusText}`);
    } catch (error: any) {
      this.logger.error(`Error during self-ping: ${error.message}`);
    }
  }
}
