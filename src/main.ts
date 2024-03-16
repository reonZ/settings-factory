import { MODULE, registerWrapper } from "foundry-api";
import { settingsConfigActivateListeners, settingsConfigRenderInner } from "./settings-config";
import { initClientStorage } from "./client-storages";

MODULE.register("settings-factory", "Settings Factory");

Hooks.on("init", () => {
    initClientStorage();

    registerWrapper("SettingsConfig.prototype._renderInner", settingsConfigRenderInner, "WRAPPER");

    registerWrapper(
        "SettingsConfig.prototype.activateListeners",
        settingsConfigActivateListeners,
        "WRAPPER"
    );

    // registerWrapper("ClientSettings.prototype.set", clientSettingsSet, "OVERRIDE");
});
