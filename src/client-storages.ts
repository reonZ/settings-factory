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
    subLocalize,
    waitDialog,
} from "foundry-api";
import {
    addFactoryStorage,
    deleteFactoryStorage,
    editFactoryStorageName,
    getFactoryStorage,
    getFactoryStorageId,
    importFactoryStorage,
    unlinkFactoryStorage,
} from "./client-settings";

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
        ["unlink-storage", unlinkFactoryStorage],
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

function createPersistentStorage(name: string, isShared: boolean, copy = false) {
    const data: FactoryStorageOptions = {
        name: name,
        isShared,
        settings: {},
    };

    if (copy) {
        const settings = game.settings.settings.entries() as IterableIterator<
            [string, FactorySetting]
        >;
        for (const [key, setting] of settings) {
            if (setting.scope === "world" || setting.persistent === false) {
                continue;
            }

            const value = window.localStorage.getItem(key);

            if (value === null) {
                continue;
            }

            data.settings[key] = value;
        }
    }

    addFactoryStorage(data);
}

function clonePersistentStorage(storageId: string) {
    const storage = getFactoryStorage(storageId);
    const data: FactoryStorageOptions = {
        settings: {},
    };

    if (storage) {
        data.name = game.i18n.format("DOCUMENT.CopyOf", { name: storage.name });
        data.settings = storage.settings;
    }

    addFactoryStorage(data);

    return true;
}

async function editPersistentStorage(storageId: string) {
    const storage = getFactoryStorage(storageId);

    if (!storage) {
        return false;
    }

    const localize = subLocalize("edit");

    const data = await waitDialog<Pick<FactoryStorage, "name">>({
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
        },
        id: MODULE.path("edit-storage", storageId),
    });

    if (!data) {
        return false;
    }

    return editFactoryStorageName(storageId, data.name);
}

async function deletePersistentStorage(storageId: string) {
    const storage = getFactoryStorage(storageId);

    if (!storage) {
        return false;
    }

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

    if (!confirm) {
        return false;
    }

    return deleteFactoryStorage(storageId);
}

async function importPersistentStorage(storageId: string) {
    if (storageId === getFactoryStorageId()) {
        return false;
    }

    const storage = getFactoryStorage(storageId);

    if (!storage) {
        return false;
    }

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

    if (strict === null) {
        return false;
    }

    return importFactoryStorage(storageId, strict);
}
