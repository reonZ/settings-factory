import {
    addListener,
    appendHTMLFromString,
    beforeHTMLFromString,
    createHTMLFromString,
    findInElementArray,
    htmlElement,
    isCheckboxElement,
    isClientSetting,
    isMenuSetting,
    isWorldSetting,
    parentElement,
    querySelector,
    querySelectorArray,
    render,
    subLocalize,
    templateLocalize,
    templatePath,
    type libWrapper,
} from "foundry-api";
import { isSettingEditable, isSettingUnlocked, setSettingUnlocked } from "./client-settings";
import {
    clientStoragesListeners,
    getFactoryStorageId,
    getFactoryStorages,
} from "./client-storages";

const localize = subLocalize("config-app");

const ICONS: Record<string, { icon: string; scope: string; type?: string }> = {
    world: {
        icon: "<i class='fa-duotone fa-earth-americas'></i>",
        scope: "world",
    },
    persistent: {
        icon: "<i class='fa-solid fa-user-shield'></i>",
        scope: "client.persistent",
    },
    client: {
        icon: "<i class='fa-solid fa-user'></i>",
        scope: "client.client",
    },
    locked: {
        icon: "<i class='fa-solid fa-user-lock'></i>",
        scope: "client.locked",
        type: "a",
    },
    unlocked: {
        icon: "<i class='fa-duotone fa-user-unlock'></i>",
        scope: "client.unlocked",
        type: "a",
    },
};

export function refreshSettingsConfig() {
    const app = Object.values(ui.windows).find((x) => x instanceof SettingsConfig);
    app?.render();
}

export async function settingsConfigRenderInner(
    wrapped: libWrapper.RegisterCallback<Promise<JQuery>>,
    data: RenderInnerData
) {
    const $html = await wrapped(data);
    const html = htmlElement($html);
    const { canConfigure, categories } = data;

    for (let c = categories.length - 1; c >= 0; c--) {
        const { menus = [], settings = [] } = categories[c];

        const settingsArray = [...menus, ...settings];
        for (let s = settingsArray.length - 1; s >= 0; s--) {
            const setting = settingsArray[s];

            if ("display" in setting && typeof setting.display === "function") {
                const display = await setting.display(setting.value);
                if (!display) {
                    settingsArray.splice(s, 1);
                }
            }
        }

        if (menus.length === 0 && settings.length === 0) {
            categories.splice(c, 1);
        }
    }

    for (const category of categories) {
        const groups = sortByGroups(category, canConfigure);

        if (canConfigure) {
            for (const group of groups) {
                group.settings.sort((a, b) => {
                    const aIsWorld = isWorldSetting(a);
                    const bIsWorld = isWorldSetting(b);
                    return aIsWorld && !bIsWorld ? -1 : bIsWorld && !aIsWorld ? 1 : 0;
                });
            }
        }

        manipulateHTML(html, groups, category);
    }

    beforeHTMLFromString(
        querySelector(html, "aside.sidebar button.reset-all"),
        `<button data-action="settings-manager" type="button">
			<i class="fa-solid fa-sliders"></i>
			${localize("button")}
		</button>`
    );

    await loadTemplates({
        "settings-factory-client-storages": templatePath("settings-manager/client-storages"),
    });

    const template = await render("settings-manager", {
        storages: getFactoryStorages(),
        storageId: getFactoryStorageId(),
        i18n: templateLocalize("config-app.manager"),
    });

    const manager = createHTMLFromString<Element>(template);

    const wrapperEl = document.createElement("div");
    wrapperEl.append(html, manager);

    return $(wrapperEl.children) as JQuery;
}

export function settingsConfigActivateListeners(
    this: FormApplication,
    wrapped: libWrapper.RegisterCallback<void>,
    $html: JQuery
) {
    wrapped($html);

    const html = htmlElement($html);
    const settings = game.settings.settings.values() as IterableIterator<FactorySetting>;

    for (const setting of settings) {
        const settingId = `${setting.namespace}.${setting.key}`;
        const settingEl = html.querySelector(`.form-group[data-setting-id="${settingId}"]`);
        if (!settingEl) continue;

        const saveOnInput = setting.saveOnInput && !setting.requiresReload;
        const onInput = typeof setting.onInput === "function" && setting.onInput;

        if (saveOnInput || onInput) {
            addListener<HTMLInputElement>(
                settingEl,
                `[name="${settingId}"]`,
                "change",
                async (event, el) => {
                    const value = settingValue(el);

                    if (onInput) {
                        const previous = settingValue(el, el.dataset.originalValue);
                        const cancel = await onInput(value, previous);

                        if (cancel) {
                            el.value = String(previous);
                            return;
                        }
                    }

                    if (saveOnInput) {
                        await game.settings.set(setting.namespace, setting.key, value);
                        this.render();
                    }
                }
            );
        }

        addListener(settingEl, ":scope > label > a", async (event, el) => {
            const unlocked = setSettingUnlocked(setting);
            if (unlocked === null) return;

            const icon = unlocked ? ICONS.unlocked : ICONS.locked;
            const iconEl = createIcon(icon);
            querySelector(el, ":scope > span").replaceWith(iconEl);
        });
    }

    const contentEl = parentElement(html);

    addListener(html, "[data-action='settings-manager']", "click", () => {
        contentEl.classList.toggle("alternate");
    });

    const managerEl = querySelector(contentEl, ".settings-manager");

    addListener(managerEl, "[data-action='return-to-settings']", "click", () => {
        contentEl.classList.toggle("alternate");
    });

    clientStoragesListeners(managerEl, this);
}

function settingValue(
    el: HTMLInputElement,
    forcedValue?: number | boolean | string
): number | boolean | string {
    const type = el.type;

    if (type === "checkbox") {
        return !!el.checked;
    }

    const value = forcedValue ?? el.value;
    const dtype = el.dataset.dtype ?? (type === "number" ? "Number" : "String");

    switch (dtype) {
        case "Number":
            return Number(value);
        case "Boolean":
            return value === "false" ? false : value;
        default:
            return value;
    }
}

function manipulateHTML(
    html: HTMLElement,
    groups: SettingsGroup[],
    category: FactorySettingCategory
) {
    const categoryElement = querySelector(html, `section.tab[data-category="${category.id}"]`);
    const groupElements = querySelectorArray<HTMLElement>(categoryElement, ":scope > .form-group");

    for (const groupEl of groupElements) {
        if (groupEl.classList.contains("submenu")) {
            const btnEl = querySelector<HTMLButtonElement>(groupEl, "button[data-key]");
            groupEl.dataset.settingKey = btnEl.dataset.key;
        } else {
            const inputEl = querySelector<HTMLInputElement | HTMLSelectElement>(
                groupEl,
                "input, select"
            );

            inputEl.dataset.originalValue = isCheckboxElement(inputEl)
                ? String(inputEl.checked)
                : inputEl.value;
        }
    }

    for (const group of groups) {
        if (group.name) {
            const name = game.i18n.localize(group.name);
            appendHTMLFromString(categoryElement, `<h3>${name}</h3>`);
        }

        for (const setting of group.settings) {
            const el = findInElementArray(groupElements, ({ dataset }) => {
                return (
                    (!!dataset.settingKey && dataset.settingKey === setting.key) ||
                    (!!dataset.settingId && "id" in setting && dataset.settingId === setting.id)
                );
            });

            const isMenu = isMenuSetting(setting);
            const isWorld = isWorldSetting(setting);
            const unlocked = isSettingUnlocked(setting);
            const editable = isSettingEditable(setting);
            const persistent = isMenu || setting.persistent !== false;

            const icon = isWorld
                ? ICONS.world
                : !persistent
                ? ICONS.persistent
                : unlocked
                ? ICONS.unlocked
                : unlocked !== null
                ? ICONS.locked
                : ICONS.client;

            const labelEl = querySelector(el, ":scope > label");
            const replaceEl = document.createElement(icon.type ?? "span");
            replaceEl.append(createIcon(icon));

            if (setting.name) {
                const name = game.i18n.localize(setting.name);
                replaceEl.append(" ", name);
            }

            if (editable === false) {
                const inputEl = querySelector<HTMLInputElement | HTMLSelectElement>(
                    el,
                    "input, select"
                );
                inputEl.disabled = true;
            }

            labelEl.replaceChildren(replaceEl);
            categoryElement.appendChild(el);
        }
    }
}

function createIcon({ icon, scope }: (typeof ICONS)[string]) {
    const iconEl = document.createElement("span");
    iconEl.dataset.tooltip = localize("scope", scope);
    iconEl.innerHTML = icon;
    return iconEl;
}

function sortByGroups({ menus, settings }: FactorySettingCategory, canConfigure: boolean) {
    let groupIndex = 0;

    const groups: Record<string, SettingsGroup> = {};

    for (const setting of [...menus, ...settings]) {
        const groupName = String(setting.group);
        groups[groupName] ??= {
            index: setting.group ? groupIndex++ : Infinity,
            name: setting.group,
            settings: [],
        };
        groups[groupName].settings.push(setting);
    }

    const groupsArray = Object.values(groups);

    if (canConfigure) {
        groupsArray.sort((a, b) => {
            const [[aOnlyWorld, aOnlyClient], [bOnlyWorld, bOnlyClient]] = [a, b].map((group) => {
                if ("hasOnlyWorld" in group) {
                    return [group.hasOnlyWorld, group.hasOnlyClient];
                }

                const hasWorld = group.settings.some(isWorldSetting);
                const hasClient = group.settings.some(isClientSetting);

                group.hasOnlyWorld = hasWorld && !hasClient;
                group.hasOnlyClient = hasClient && !hasWorld;

                return [group.hasOnlyWorld, group.hasOnlyClient];
            });

            return aOnlyWorld && !bOnlyWorld
                ? -1
                : aOnlyClient && !bOnlyClient
                ? 1
                : a.index - b.index;
        });
    } else {
        for (const group of groupsArray) {
            group.hasOnlyWorld = false;
            group.hasOnlyClient = true;
        }

        groupsArray.sort((a, b) => a.index - b.index);
    }

    return groupsArray;
}
