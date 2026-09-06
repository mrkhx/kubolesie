import type { GameCommandType, QuestStatus, Rarity, ResourceType } from '@kubolesie/shared';

export interface DialogueCondition {
  type: 'flag' | 'item' | 'resource' | 'always' | 'quest' | 'location' | 'equipped';
  flag?: string;
  equals?: string;
  exists?: boolean;
  templateId?: string;
  resource?: ResourceType;
  min?: number;
  questId?: string;
  statuses?: QuestStatus[];
  locationId?: string;
}

export type DialogueAction =
  | { type: 'set_flag'; flag: string; value?: string }
  | { type: 'add_resource'; resource: ResourceType; amount: number }
  | { type: 'give_item'; templateId: string; rarity?: Rarity; source?: 'CREATED' | 'LOOTED' }
  | { type: 'set_relation'; npcId: string; trustDelta?: number; reputationDelta?: number }
  | { type: 'set_location'; locationId: string }
  | { type: 'set_state'; state: string }
  | { type: 'claim_reward'; rewardType: string; rewardRef: string }
  | { type: 'start_quest'; questId: string }
  | { type: 'set_discovery'; discoveryId: string; title: string; seen?: boolean; defeated?: boolean }
  | { type: 'spend_energy'; amount: number }
  | { type: 'visit'; locationId: string }
  | { type: 'consume_item'; templateId: string; elseNode?: string; thenNode?: string };

export interface DialogueChoice {
  id: string;
  label: string;
  nextNode?: string;
  condition?: DialogueCondition | DialogueCondition[];
  actions?: DialogueAction[];
  command?: GameCommandType;
  commandPayload?: Record<string, unknown>;
}

export interface DialogueNode {
  id: string;
  text: string;
  choices: DialogueChoice[];
}
