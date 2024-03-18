import {
    MODULE,
    isClientSetting,
    isMenuSetting,
    mapValues,
    setFlag,
    updateFlag,
} from "foundry-api";

const factoryCache: FactoryCache = {
    storageId: "",
    unlocked: {},
    storages: {},
    storage: null,
};

function defaultStorageName(storageId: string) {
    return `Storage-${storageId}`;
}

export function isSharedStorage() {
    return factoryCache.storage?.isShared ?? null;
}

export function getFactoryStorage(storageId: string = factoryCache.storageId) {
    return storageId === factoryCache.storageId
        ? factoryCache.storage
        : factoryCache.storages[storageId] ?? null;
}

export function getFactoryStorageId() {
    return factoryCache.storageId || null;
}

export function getFactoryStorages() {
    return factoryCache.storages;
}

export function initClientStorage() {
    const userId = game.data.userId;
    const user = game.data.users.find((u) => u._id === userId)!;
    const factoryFlag = getProperty<UserFactoryFlag>(user, `flags.${MODULE.id}`) ?? {};

    factoryCache.storages = mapValues(
        factoryFlag.storages ?? {},
        ({ id, isShared, name, settings }) => ({
            id,
            name,
            isShared,
            settings: flattenObject(settings),
        })
    );

    if (!factoryFlag.storageId) {
        return;
    }

    // TODO get storage from shared if required
    const storage = factoryCache.storages[factoryFlag.storageId];

    if (!storage) {
        return;
    }

    factoryCache.storageId = factoryFlag.storageId;
    factoryCache.storage = deepClone(storage);
    factoryCache.unlocked = deepClone(factoryFlag.unlocked ?? {});
}

export function addFactoryStorage(data: FactoryStorageOptions) {
    const storageId = randomID();

    const storageData: FactoryCachedStorage = {
        id: storageId,
        name: data.name?.trim() || defaultStorageName(storageId),
        settings: deepClone(data.settings),
        isShared: data.isShared ?? false,
    };

    factoryCache.storages[storageId] = storageData;
    setFlag(game.user, "storages", storageId, storageData);
}

export function editFactoryStorageName(storageId: string, name: string) {
    const storage = getFactoryStorage(storageId);

    if (!storage) {
        return false;
    }

    storage.name = name.trim() || defaultStorageName(storageId);
    setFlag(game.user, "storages", storageId, "name", name);

    return true;
}

export function deleteFactoryStorage(storageId: string) {
    if (!getFactoryStorage(storageId)) {
        return false;
    }

    const updates: UpdatableFactoryFlag = {
        storages: {
            [`-=${storageId}`]: true,
        },
    };

    if (factoryCache.storageId === storageId) {
        factoryCache.storageId = "";
        factoryCache.unlocked = {};
        factoryCache.storage = null;

        updates[`-=storageId`] = true;
        updates[`-=unlocked`] = true;
    }

    delete factoryCache.storages[storageId];
    updateFlag(game.user, updates);

    return true;
}

export function unlinkFactoryStorage() {
    if (!factoryCache.storage) {
        return false;
    }

    factoryCache.storageId = "";
    factoryCache.unlocked = {};
    factoryCache.storage = null;

    updateFlag<UpdatableFactoryFlag>(game.user, {
        [`-=storageId`]: true,
        [`-=unlocked`]: true,
    });

    return true;
}

export async function importFactoryStorage(storageId: string, strict: boolean) {
    if (storageId === factoryCache.storageId) {
        return false;
    }

    const storage = getFactoryStorage(storageId);
    if (!storage) {
        return false;
    }

    const changes: { key: string; setting: FactorySetting; value: string }[] = [];
    const settings = game.settings.settings.entries() as IterableIterator<[string, FactorySetting]>;

    for (const [key, setting] of settings) {
        if (setting.scope === "world" || setting.persistent === false) {
            continue;
        }

        const value = storage.settings[key] ?? null;
        const current = window.localStorage.getItem(key);

        if (value === current) {
            continue;
        }

        if (strict && value === null) {
            const defaultValue = JSON.stringify(setting.default);
            if (current !== defaultValue) {
                changes.push({ key, setting, value: defaultValue });
            }
            continue;
        }

        if (value !== null) {
            changes.push({ key, setting, value });
        }
    }

    factoryCache.storageId = storageId;
    factoryCache.unlocked = {};
    factoryCache.storage = storage;

    let requiresReload = false;

    for (const { key, setting, value } of changes) {
        requiresReload ||= !!setting.requiresReload;
        window.localStorage.setItem(key, value);
        settingChanged(setting, key, value);
    }

    const updates: UpdatableFactoryFlag = {
        storageId,
        "-=unlocked": true,
    };

    if (requiresReload) {
        await updateFlag(game.user, updates);
        SettingsConfig.reloadConfirm({ world: false });
    } else {
        updateFlag(game.user, updates);
    }

    return true;
}

export function isSettingUnlocked(settingId: string) {
    if (!factoryCache.storage) {
        return null;
    }

    const inStorage = factoryCache.storage.settings[settingId] ?? null;

    if (inStorage !== window.localStorage.getItem(settingId)) {
        return true;
    }

    return factoryCache.unlocked[settingId] === true;
}

function settingChanged(setting: ClientSetting, key: string, value: string) {
    if (setting.onChange instanceof Function) {
        const parsed = new Setting({ key, value }).value;
        setting.onChange(parsed);
    }
}

export async function setSettingUnlocked(settingId: string, unlocked?: boolean) {
    const storage = factoryCache.storage;

    if (!storage) {
        return null;
    }

    const storedUnlocked = isSettingUnlocked(settingId);
    const setUnlocked = unlocked ?? !storedUnlocked;

    if (setUnlocked === storedUnlocked) {
        return false;
    }

    const updates: UpdatableFactoryFlag = {
        unlocked: {
            [settingId]: setUnlocked,
        },
    };

    let requiresReload = false;

    if (!setUnlocked) {
        if (storage.isShared) {
            const setting = game.settings.settings.get(settingId)!;
            const value = storage.settings[settingId];

            if (value == null) {
                window.localStorage.removeItem(settingId);
            } else {
                window.localStorage.setItem(settingId, value);
            }

            settingChanged(setting, settingId, value);

            requiresReload ||= !!setting.requiresReload;
        } else {
            const currentValue = window.localStorage.getItem(settingId);
            const settings: UpdatableStorageSettings = {};

            if (currentValue == null) {
                delete storage.settings[settingId];
                settings[`-=${settingId}`] = true;
            } else {
                storage.settings[settingId] = currentValue;
                settings[settingId] = currentValue;
            }

            updates.storages = {
                [storage.id]: {
                    settings,
                },
            };
        }
    }

    factoryCache.unlocked[settingId] = setUnlocked;

    if (requiresReload) {
        await updateFlag(game.user, updates);
        SettingsConfig.reloadConfirm({ world: false });
    } else {
        updateFlag(game.user, updates);
    }

    return setUnlocked;
}

export function wrapClientStorage() {
    const base = {
        get length() {
            return window.localStorage.length;
        },
        getItem(key: string) {
            return window.localStorage.getItem(key);
        },
        setItem(key: string, value: string) {
            const storage = factoryCache.storage;

            if (!storage || isSettingUnlocked(key) === true) {
                window.localStorage.setItem(key, value);
                return;
            }

            const updates: UpdatableFactoryFlag = {};

            if (storage.isShared) {
                factoryCache.unlocked[key] = true;
                updates.unlocked = {
                    [key]: true,
                };
            } else {
                storage.settings[key] = value;
                updates.storages = {
                    [storage.id]: {
                        settings: {
                            [key]: value,
                        },
                    },
                };
            }

            updateFlag(game.user, updates);

            window.localStorage.setItem(key, value);
        },
        clear() {
            window.localStorage.clear();
        },
        key(index: number) {
            return window.localStorage.key(index);
        },
        removeItem(key: string) {
            window.localStorage.removeItem(key);
        },
    };

    const proxyHandler: ProxyHandler<typeof base> = {
        get(target, prop, receiver) {
            if (
                typeof prop === "symbol" ||
                ["length", "getItem", "setItem", "clear", "key", "removeItem"].includes(prop)
            ) {
                return Reflect.get(target, prop, receiver);
            }
            return window.localStorage[prop];
        },
        has(target, key) {
            return key in window.localStorage;
        },
    };

    const storage = new Proxy(base, proxyHandler);

    game.settings.storage.set("client", storage);
}
