import { isClientSetting, isMenuSetting, updateFlag } from "foundry-api";
import { getFactoryStorage, getFactoryUnlocked, setFactoryUnlocked } from "./client-storages";

function getSettingId(setting: FactorySetting) {
    return `${setting.namespace}.${setting.key}`;
}

function getStorageValue(storage: FactoryStorage, settingId: string) {
    return getProperty<string>(storage.settings, settingId) ?? null;
}

function isValidSetting(setting: FactorySettingAny): setting is FactorySetting {
    return !isMenuSetting(setting) && isClientSetting(setting);
}

export function isSettingEditable(setting: FactorySettingAny) {
    if (!isValidSetting(setting)) return null;

    const storage = getFactoryStorage();
    if (!storage) return null;

    const unlocked = isSettingUnlocked(setting);
    return unlocked === true || !storage.isShared;
}

export function isSettingUnlocked(setting: FactorySettingAny) {
    if (!isValidSetting(setting)) return null;

    const storage = getFactoryStorage();
    if (!storage) return null;

    const settingId = getSettingId(setting);
    const inStorage = getStorageValue(storage, settingId);
    if (inStorage !== window.localStorage.getItem(settingId)) {
        return true;
    }

    return getFactoryUnlocked(settingId) === true;
}

// TODO handle isShared
export function setSettingUnlocked(setting: FactorySettingAny, unlocked?: boolean) {
    if (!isValidSetting(setting)) return null;

    const storage = getFactoryStorage();
    if (!storage) return null;

    const settingId = getSettingId(setting);
    const storedUnlocked = isSettingUnlocked(setting);
    const setUnlocked = unlocked ?? !storedUnlocked;
    if (setUnlocked === storedUnlocked) return false;

    const updates: UpdatableFactoryFlag = {
        unlocked: {
            [settingId]: setUnlocked,
        },
    };

    if (!setUnlocked) {
        const currentValue = window.localStorage.getItem(settingId);
        const hasCurrentValue = currentValue != null;

        if (storage.isShared) {
            // TODO change current value
        } else {
            const settingIdKey = hasCurrentValue ? settingId : `-=${settingId}`;

            if (hasCurrentValue) {
                storage.settings[settingId] = currentValue;
            } else {
                delete storage.settings[settingId];
            }

            updates.storages = {
                [storage.id]: {
                    settings: {
                        [settingIdKey]: currentValue ?? true,
                    },
                },
            };
        }
    }

    setFactoryUnlocked(settingId, setUnlocked);
    updateFlag(game.user, updates);

    return setUnlocked;
}

// function wrapClientStorage() {
//     const base = {
//         get length() {
//             return window.localStorage.length;
//         },
//         getItem(key: string) {
//             return window.localStorage.getItem(key);
//         },
//         setItem(key: string, value: string) {
//             window.localStorage.setItem(key, value);
//         },
//         clear() {
//             window.localStorage.clear();
//         },
//         key(index: number) {
//             return window.localStorage.key(index);
//         },
//         removeItem(key: string) {
//             window.localStorage.removeItem(key);
//         },
//     };

//     const proxyHandler: ProxyHandler<typeof base> = {
//         get(target, prop, receiver) {
//             if (
//                 typeof prop === "symbol" ||
//                 ["length", "getItem", "setItem", "clear", "key", "removeItem"].includes(prop)
//             ) {
//                 return Reflect.get(target, prop, receiver);
//             }
//             return window.localStorage[prop];
//         },
//         has(target, key) {
//             return key in window.localStorage;
//         },
//     };

//     const storage = new Proxy(base, proxyHandler);

//     game.settings.storage.set("client", storage);
// }

// export async function clientSettingsSet(
//     this: ClientSettings,
//     namespace: string,
//     key: string,
//     value: any,
//     options: any = {}
// ) {
//     if (!namespace || !key) {
//         throw new Error("You must specify both namespace and key portions of the setting");
//     }

//     key = `${namespace}.${key}`;
//     if (!this.settings.has(key)) {
//         throw new Error("This is not a registered game setting");
//     }

//     // Obtain the setting data and serialize the value
//     const setting = this.settings.get(key);
//     if (value === undefined) value = setting.default;
//     if (foundry.utils.isSubclass(setting.type, foundry.abstract.DataModel)) {
//         value = setting.type.fromSource(value, { strict: true });
//     }

//     // Save the setting change
//     if (setting.scope === "world") await setWorld.call(this, key, value, options);
//     else await setClient.call(this, key, value, setting.onChange);
//     return value;
// }

// async function setWorld(this: ClientSettings, key: string, value: any, options: any) {
//     if (!game.ready) {
//         throw new Error("You may not set a World-level Setting before the Game is ready.");
//     }

//     const current = this.storage.get("world").getSetting(key);
//     const json = JSON.stringify(value);

//     if (current) return current.update({ value: json }, options);
//     else return Setting.create({ key, value: json }, options);
// }

// async function setClient(
//     this: ClientSettings,
//     key: string,
//     value: any,
//     onChange: ClientSetting["onChange"] | undefined
// ) {
//     const storage = this.storage.get("client");
//     const json = JSON.stringify(value);

//     let setting;

//     if (key in storage) {
//         setting = new Setting({ key, value: storage.getItem(key) });
//         const diff = setting.updateSource({ value: json });
//         if (foundry.utils.isEmpty(diff)) return setting;
//     } else {
//         setting = new Setting({ key, value: json });
//     }

//     // TODO save to factory storage if not unlocked

//     storage.setItem(key, json);

//     if (onChange instanceof Function) {
//         onChange(value);
//     }

//     return setting;
// }
