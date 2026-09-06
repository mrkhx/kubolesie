export class GameError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export class InsufficientResourcesError extends GameError {
  constructor(message = 'Не хватает ресурсов.') {
    super(message, 'INSUFFICIENT_RESOURCES');
  }
}

export class InsufficientEnergyError extends GameError {
  constructor(message = 'Не хватает энергии.') {
    super(message, 'INSUFFICIENT_ENERGY');
  }
}

export class InsufficientCoinsError extends GameError {
  constructor(message = 'Монеты не могут уйти ниже нуля.') {
    super(message, 'INSUFFICIENT_COINS');
  }
}

export class ItemNotOwnedError extends GameError {
  constructor(message = 'Этот предмет тебе не принадлежит.') {
    super(message, 'ITEM_NOT_OWNED');
  }
}

export class RewardAlreadyClaimedError extends GameError {
  constructor(message = 'Награда уже получена.') {
    super(message, 'REWARD_ALREADY_CLAIMED');
  }
}

export class UnknownCommandError extends GameError {
  constructor(command: string) {
    super(`Неизвестная команда: ${command}`, 'UNKNOWN_COMMAND');
  }
}

export class ActionRejectedError extends GameError {
  constructor(message = 'Сейчас это сделать нельзя.') {
    super(message, 'ACTION_REJECTED');
  }
}
