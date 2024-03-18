declare type FactorySettingCategory = RenderInnerData["categories"][number];

declare type RenderInnerData = SettingsConfig.RenderInnerData<FactorySetting, FactorySettingMenu>;

declare type SettingsGroup = {
    index: number;
    name: string | undefined;
    hasOnlyWorld?: boolean;
    hasOnlyClient?: boolean;
    settings: (FactorySetting | FactorySettingMenu)[];
};

declare type StorageSettingId = string | { namespace: string; key: string };

declare type StorageSettings = CyclicRecord<string>;

declare type UpdatableStorageSettings = {
    [k: string]: string | true;
};

declare type FactoryStorage = {
    id: string;
    name: string;
    settings: StorageSettings;
    isShared: boolean;
};

declare type FactoryCachedStorage = Omit<FactoryStorage, "settings"> & {
    settings: Record<string, string>;
};

declare type FactoryStorageOptions = Partial<Pick<FactoryStorage, "name" | "isShared">> & {
    settings: Record<string, string>;
};

declare type UserFactoryFlag = {
    storageId?: string;
    storages?: Record<string, FactoryStorage>;
    unlocked?: Record<string, boolean>;
};

declare type FactoryCache = Required<Omit<UserFactoryFlag, "storages">> & {
    storages: Record<string, FactoryCachedStorage>;
    storage: FactoryCachedStorage | null;
};

declare type UpdatableFactoryFlag = Omit<UserFactoryFlag, "storages"> & {
    "-=storageId"?: true;
    "-=unlocked"?: true;
    storages?: {
        [k: string]:
            | true
            | (Omit<Partial<FactoryStorage>, "settings"> & {
                  settings?: UpdatableStorageSettings;
              });
    };
};
