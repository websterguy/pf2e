import { ConsumablePF2e, type SpellPF2e } from "@item";
import { ConsumableSource } from "@item/base/data/index.ts";
import { MagicTradition } from "@item/spell/types.ts";
import { MAGIC_TRADITIONS } from "@item/spell/values.ts";
import { traditionSkills } from "@item/spellcasting-entry/trick.ts";
import { DCOptions, calculateDC } from "@module/dc.ts";
import { ErrorPF2e, setHasElement } from "@util";
import * as R from "remeda";

const CANTRIP_DECK_ID = "tLa4bewBhyqzi6Ow";

const scrollCompendiumIds: Record<number, string | undefined> = {
    1: "RjuupS9xyXDLgyIr",
    2: "Y7UD64foDbDMV9sx",
    3: "ZmefGBXGJF3CFDbn",
    4: "QSQZJ5BC3DeHv153",
    5: "tjLvRWklAylFhBHQ",
    6: "4sGIy77COooxhQuC",
    7: "fomEZZ4MxVVK3uVu",
    8: "iPki3yuoucnj7bIt",
    9: "cFHomF3tty8Wi1e5",
    10: "o1XIHJ4MJyroAHfF",
};

type SpellConsumableItemType = "cantripDeck5" | "scroll" | "wand";
const SPELL_CONSUMABLE_NAME_TEMPLATES = {
    cantripDeck5: "PF2E.Item.Physical.FromSpell.CantripDeck5",
    scroll: "PF2E.Item.Physical.FromSpell.Scroll",
    wand: "PF2E.Item.Physical.FromSpell.Wand",
};

const wandCompendiumIds: Record<number, string | undefined> = {
    1: "UJWiN0K3jqVjxvKk",
    2: "vJZ49cgi8szuQXAD",
    3: "wrDmWkGxmwzYtfiA",
    4: "Sn7v9SsbEDMUIwrO",
    5: "5BF7zMnrPYzyigCs",
    6: "kiXh4SUWKr166ZeM",
    7: "nmXPj9zuMRQBNT60",
    8: "Qs8RgNH6thRPv2jt",
    9: "Fgv722039TVM5JTc",
};

function getIdForSpellConsumable(type: SpellConsumableItemType, heightenedLevel: number): string | null {
    switch (type) {
        case "cantripDeck5":
            return CANTRIP_DECK_ID;
        case "scroll":
            return scrollCompendiumIds[heightenedLevel] ?? null;
        default:
            return wandCompendiumIds[heightenedLevel] ?? null;
    }
}

function getNameForSpellConsumable(type: SpellConsumableItemType, spellName: string, heightenedLevel: number): string {
    const templateId = SPELL_CONSUMABLE_NAME_TEMPLATES[type] || `${type} of {name} (Level {level})`;
    return game.i18n.format(templateId, { name: spellName, level: heightenedLevel });
}

function isSpellConsumable(itemId: string): boolean {
    return (
        itemId === CANTRIP_DECK_ID ||
        Object.values(scrollCompendiumIds).includes(itemId) ||
        Object.values(wandCompendiumIds).includes(itemId)
    );
}

async function createConsumableFromSpell(
    spell: SpellPF2e,
    {
        type,
        heightenedLevel = spell.baseRank,
        mystified = false,
    }: {
        type: SpellConsumableItemType;
        heightenedLevel?: number;
        mystified?: boolean;
    },
): Promise<ConsumableSource> {
    const pack = game.packs.find((p) => p.collection === "pf2e.equipment-srd");
    const itemId = getIdForSpellConsumable(type, heightenedLevel);
    const consumable = await pack?.getDocument(itemId ?? "");
    if (!(consumable instanceof ConsumablePF2e)) {
        throw ErrorPF2e("Failed to retrieve consumable item");
    }

    const consumableSource = { ...consumable.toObject(), _id: null }; // Clear _id

    const traits = consumableSource.system.traits;
    traits.value = R.unique([...traits.value, ...spell.system.traits.value]);
    traits.rarity = spell.rarity;
    if (traits.value.includes("magical") && traits.value.some((t) => setHasElement(MAGIC_TRADITIONS, t))) {
        traits.value.splice(traits.value.indexOf("magical"), 1);
    }
    traits.value.sort();

    consumableSource.name = getNameForSpellConsumable(type, spell.name, heightenedLevel);
    const description = consumableSource.system.description.value;

    consumableSource.system.description.value = (() => {
        const paragraphElement = document.createElement("p");
        paragraphElement.append(spell.sourceId ? `@UUID[${spell.sourceId}]{${spell.name}}` : spell.description);

        const containerElement = document.createElement("div");
        const hrElement = document.createElement("hr");
        containerElement.append(paragraphElement, hrElement);
        hrElement.insertAdjacentHTML("afterend", description);

        return containerElement.innerHTML;
    })();

    // Cantrip deck casts at level 1
    if (type !== "cantripDeck5") {
        consumableSource.system.spell = fu.mergeObject(
            spell._source,
            { _id: fu.randomID(), system: { location: { value: null, heightenedLevel } } },
            { inplace: false },
        );
    }

    if (mystified) {
        consumableSource.system.identification.status = "unidentified";
    }

    return consumableSource;
}

interface TrickMagicItemDifficultyData {
    arcana?: number;
    religion?: number;
    occultism?: number;
    nature?: number;
}

function calculateTrickMagicItemCheckDC(
    item: ConsumablePF2e,
    options: DCOptions = { pwol: false },
): TrickMagicItemDifficultyData {
    const level = Number(item.level);
    const saveDC = calculateDC(level, options);

    const traditions = item.system.spell?.system.traits.traditions ?? [];
    const skills: [string, number][] = [...item.system.traits.value, ...traditions]
        .filter((t): t is MagicTradition => setHasElement(MAGIC_TRADITIONS, t))
        .map((tradition) => [traditionSkills[tradition], saveDC]);

    return Object.fromEntries(skills);
}

export { calculateTrickMagicItemCheckDC, createConsumableFromSpell, isSpellConsumable };
export type { SpellConsumableItemType, TrickMagicItemDifficultyData };
