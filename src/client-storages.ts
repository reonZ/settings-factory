import {
    MODULE,
    addListener,
    addListenerAll,
    closest,
    confirmDialog,
    findInElementArray,
    htmlElement,
    querySelector,
    querySelectorArray,
    setFlag,
    subLocalize,
    updateFlag,
    waitDialog,
} from "foundry-api";

const factoryCache: Required<UserFactoryFlag> & { storage: FactoryStorage | null } = {
    storageId: "",
    unlocked: {},
    storages: {},
    storage: null,
};

export function getFactoryStorageId() {
    return factoryCache.storageId || null;
}

export function isSharedFactoryStorage() {}

export function getFactoryStorage(storageId: string = factoryCache.storageId) {
    return storageId === factoryCache.storageId
        ? factoryCache.storage
        : factoryCache.storages[storageId] ?? null;
}

export function getFactoryStorages() {
    return factoryCache.storages;
}

export function getFactoryUnlocked(settingId: string) {
    return factoryCache.storage ? factoryCache.unlocked[settingId] : null;
}

export function setFactoryUnlocked(settingId: string, unlocked: boolean) {
    if (!factoryCache.storage) return;
    factoryCache.unlocked[settingId] = unlocked;
}

export function initClientStorage() {
    const userId = game.data.userId;
    const user = game.data.users.find((u) => u._id === userId)!;
    const factoryFlag = getProperty<UserFactoryFlag>(user, `flags.${MODULE.id}`) ?? {};

    factoryCache.storages = deepClone(factoryFlag.storages ?? {});
    if (!factoryFlag.storageId) return;

    // TODO get storage from shared if required
    const storage = factoryCache.storages[factoryCache.storageId];
    if (!storage) return;

    factoryCache.storageId = factoryFlag.storageId;
    factoryCache.storage = deepClone(storage);
    factoryCache.unlocked = deepClone(factoryFlag.unlocked ?? {});
}

export function clientStoragesListeners(html: Element, app: FormApplication) {
    const createNameEl = querySelector<HTMLInputElement>(html, "[name='storage-creation-name']");
    const createTypeElList = querySelectorArray<HTMLInputElement>(
        html,
        "[name='storage-creation-type']"
    );

    addListener(html, "[data-action='create-storage']", "click", () => {
        const name = createNameEl.value;
        const mode = findInElementArray(createTypeElList, (el) => el.checked).value;
        createPersistentStorage(name, false, mode === "copy");
        app.render();
    });

    const actions = [
        ["clone-storage", clonePersistentStorage],
        ["edit-storage", editPersistentStorage],
        ["delete-storage", deletePersistentStorage],
        ["import-settings", importPersistentStorage],
        ["import-settings", unlinkStorage],
    ] as const;
    for (const [action, callback] of actions) {
        addListenerAll(html, `[data-action="${action}"]`, async (_, el) => {
            const storageId = closest<HTMLElement>(el, "[data-storage-id]").dataset.storageId!;
            if (await callback(storageId)) {
                app.render();
            }
        });
    }
}

function defaultStorageName(storageId: string) {
    return `Storage-${storageId}`;
}

function createPersistentStorage(name: string, isShared: boolean, copy = false) {
    const storageId = randomID();
    const data: FactoryStorage = {
        id: storageId,
        name: name.trim() || defaultStorageName(storageId),
        settings: {},
        isShared,
    };

    if (copy) {
        const settings = game.settings.settings.entries() as IterableIterator<
            [string, FactorySetting]
        >;
        for (const [key, setting] of settings) {
            if (setting.scope === "world" || setting.persistent === false) continue;

            const value = window.localStorage.getItem(key);
            if (value === null) continue;

            data.settings[key] = value;
        }
    }

    factoryCache.storages[storageId] = data;
    setFlag(game.user, "storages", storageId, data);
}

function clonePersistentStorage(otherId: string) {
    const storage = getFactoryStorage(otherId);
    const storageId = randomID();
    const data: FactoryStorage = {
        id: storageId,
        name: defaultStorageName(storageId),
        settings: {},
        isShared: false,
    };

    if (storage) {
        data.name = game.i18n.format("DOCUMENT.CopyOf", { name: storage.name });
        data.settings = deepClone(storage.settings);
    }

    factoryCache.storages[storageId] = data;
    setFlag(game.user, "storages", storageId, data);

    return true;
}

async function editPersistentStorage(storageId: string) {
    const storage = getFactoryStorage(storageId);
    if (!storage) return false;

    const localize = subLocalize("edit");

    const data = await waitDialog<FactoryStorageOptions>({
        title: localize("title"),
        template: "dialogs/edit",
        yes: {
            label: localize("edit"),
            callback: ($html) => {
                const html = htmlElement($html);
                return {
                    name: querySelector<HTMLInputElement>(html, "[name='storage-name']").value,
                };
            },
        },
        no: localize("cancel"),
        data: {
            i18n: localize.i18n,
            storage,
            namePlaceholder: defaultStorageName(storageId),
        },
        id: MODULE.path("edit-storage", storageId),
    });

    if (!data) return false;

    const name = data.name.trim() || defaultStorageName(storageId);
    if (name === storage.name) return false;

    storage.name = name;
    setFlag(game.user, "storages", storageId, "name", name);

    return true;
}

async function deletePersistentStorage(storageId: string) {
    const storage = getFactoryStorage(storageId);
    if (!storage) return false;

    const localize = subLocalize("delete");

    const confirm = await confirmDialog({
        title: localize("title"),
        template: "dialogs/delete",
        data: {
            i18n: localize.i18n,
            name: storage.name,
        },
        id: MODULE.path("delete-storage", storageId),
    });

    if (!confirm) return false;

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

async function importPersistentStorage(storageId: string) {
    if (storageId === factoryCache.storageId) return false;

    const storage = getFactoryStorage(storageId);
    if (!storage) return false;

    const localize = subLocalize("import");

    const strict = await waitDialog<boolean>({
        title: localize("title"),
        template: "dialogs/import",
        yes: {
            icon: "fa-solid fa-arrow-down-to-square",
            label: localize("import"),
            callback: ($html) => {
                const html = htmlElement($html);
                return (
                    querySelector<HTMLInputElement>(html, "[name='import-type']:checked").value ===
                    "strict"
                );
            },
        },
        no: localize("cancel"),
        data: {
            storage,
            i18n: localize.i18n,
        },
        id: MODULE.path("import-storage"),
    });

    if (strict === null) return false;

    factoryCache.storageId = storageId;
    factoryCache.unlocked = {};
    factoryCache.storage = storage;

    const updates: UpdatableFactoryFlag = {
        storageId,
        "-=unlocked": true,
    };

    const changes: { key: string; setting: FactorySetting; value: string }[] = [];
    const storageEntries = flattenObject(storage.settings);
    const settings = game.settings.settings.entries() as IterableIterator<[string, FactorySetting]>;

    for (const [key, setting] of settings) {
        if (setting.scope === "world" || setting.persistent === false) continue;

        const value = storageEntries[key] ?? null;
        const current = window.localStorage.getItem(key);
        if (value === current) continue;

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

    let requiresReload = false;

    for (const { key, setting, value } of changes) {
        requiresReload ||= !!setting.requiresReload;
        // window.localStorage.setItem(key, value);
        // if (!(setting.onChange instanceof Function)) continue;
        // const parsed = new Setting({ key: key, value }).value;
        // setting.onChange(parsed);
    }

    updateFlag(game.user, updates);

    if (requiresReload) {
        SettingsConfig.reloadConfirm({ world: false });
    }

    return true;
}

function unlinkStorage() {
    factoryCache.storageId = "";
    factoryCache.unlocked = {};
    factoryCache.storage = null;

    updateFlag<UpdatableFactoryFlag>(game.user, {
        [`-=storageId`]: true,
        [`-=unlocked`]: true,
    });

    return true;
}
