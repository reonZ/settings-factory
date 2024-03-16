declare type FactorySettingCategory = RenderInnerData["categories"][number];

declare type RenderInnerData = SettingsConfig.RenderInnerData<FactorySetting, FactorySettingMenu>;

declare type SettingsGroup = {
    index: number;
    name: string | undefined;
    hasOnlyWorld?: boolean;
    hasOnlyClient?: boolean;
    settings: FactorySettingAny[];
};

declare type StorageSettingId = string | { namespace: string; key: string };

declare type StorageSettings = CyclicRecord<string>;

declare type FactoryStorage = {
    id: string;
    name: string;
    settings: StorageSettings;
    isShared: boolean;
};

declare type FactoryStorageOptions = Pick<FactoryStorage, "name">;

declare type UserFactoryFlag = {
    storageId?: string;
    storages?: Record<string, FactoryStorage>;
    unlocked?: Record<string, boolean>;
};

declare type UpdatableFactoryFlag = Omit<UserFactoryFlag, "storages"> & {
    "-=storageId"?: true;
    "-=unlocked"?: true;
    storages?: {
        [k: string]:
            | true
            | (Omit<Partial<FactoryStorage>, "settings"> & {
                  settings?: {
                      [k: string]: string | true | CyclicRecord<string | true>;
                  };
              });
    };
};
