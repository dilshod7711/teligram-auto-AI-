"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateTelegramDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_telegram_dto_1 = require("./create-telegram.dto");
class UpdateTelegramDto extends (0, mapped_types_1.PartialType)(create_telegram_dto_1.CreateTelegramDto) {
}
exports.UpdateTelegramDto = UpdateTelegramDto;
//# sourceMappingURL=update-telegram.dto.js.map