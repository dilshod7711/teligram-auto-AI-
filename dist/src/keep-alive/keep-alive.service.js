"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var KeepAliveService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeepAliveService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
let KeepAliveService = KeepAliveService_1 = class KeepAliveService {
    logger = new common_1.Logger(KeepAliveService_1.name);
    async handleCron() {
        const url = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
        if (!url) {
            this.logger.warn('RENDER_EXTERNAL_URL or APP_URL is not set. Cannot ping self to keep alive.');
            return;
        }
        try {
            this.logger.log(`Pinging self at ${url} to keep alive...`);
            const response = await fetch(url);
            this.logger.log(`Ping status: ${response.status} ${response.statusText}`);
        }
        catch (error) {
            this.logger.error(`Error during self-ping: ${error.message}`);
        }
    }
};
exports.KeepAliveService = KeepAliveService;
__decorate([
    (0, schedule_1.Cron)('*/14 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], KeepAliveService.prototype, "handleCron", null);
exports.KeepAliveService = KeepAliveService = KeepAliveService_1 = __decorate([
    (0, common_1.Injectable)()
], KeepAliveService);
//# sourceMappingURL=keep-alive.service.js.map