import { Game, Move, PlayerIndex } from '@shared/game-engine';
import HostedGame from '../shared/app/models/HostedGame';
import { HostedGameState } from '@shared/app/Types';
import Player from '../shared/app/models/Player';
import { Outcome } from '@shared/game-engine/Types';
import { GameTimeData } from '@shared/time-control/TimeControl';
import { TypedEmitter } from 'tiny-typed-emitter';
import { Socket } from 'socket.io-client';
import { HexClientToServerEvents, HexServerToClientEvents } from '../shared/app/HexSocketEvents';
import { apiPostCancel, apiPostResign } from './apiClient';
import TimeControlType from '@shared/time-control/TimeControlType';
import HostedGameOptions from '../shared/app/models/HostedGameOptions';
import ChatMessage from '../shared/app/models/ChatMessage';
import HostedGameToPlayer from '../shared/app/models/HostedGameToPlayer';

type HostedGameClientEvents = {
    started: () => void;
    chatMessagePosted: () => void;
};

/**
 * Contains info to display in the games list on lobby (HostedGame).
 * If needed, can also download full game data and start listening to game events (Game).
 */
export default class HostedGameClient extends TypedEmitter<HostedGameClientEvents>
{
    /**
     * Null if game data not fully loaded yet, i.e for lobby list display.
     * Game data can still be retrieved in hostedGame.
     */
    private game: null | Game = null;

    /**
     * Number of messages in chatMessages list
     * on last time player open the chat.
     */
    private readMessages: number;

    constructor(
        private hostedGame: HostedGame,
        private socket: Socket<HexServerToClientEvents, HexClientToServerEvents>,
    ) {
        super();

        this.readMessages = hostedGame.chatMessages.length;
    }

    getState(): HostedGameState
    {
        return this.hostedGame.state;
    }

    getPlayerIndex(player: Player): number
    {
        return this.hostedGame.hostedGameToPlayers.findIndex(p => p.player.publicId === player.publicId);
    }

    loadGame(): Game
    {
        return this.game ?? this.loadGameFromData(this.hostedGame);
    }

    private loadGameFromData(hostedGame: HostedGame): Game
    {
        const { gameData } = hostedGame;

        /**
         * No game server side, create an empty one to show client side
         */
        if (null === gameData) {
            this.game = new Game(hostedGame.gameOptions.boardsize);

            // Cancel here in case game has been canceled before started
            if ('canceled' === hostedGame.state) {
                this.game.cancel();
            }

            return this.game;
        }

        this.game = new Game(gameData.size);

        this.game.setAllowSwap(gameData.allowSwap);
        this.game.setStartedAt(gameData.startedAt);

        this.onServerGameStarted(hostedGame);

        // Replay game and fill history
        for (const move of gameData.movesHistory) {
            this.game.move(new Move(move.row, move.col), this.game.getCurrentPlayerIndex());
        }

        // Cancel game if canceled
        if ('canceled' === hostedGame.state && !this.game.isEnded()) {
            this.game.cancel();
        }

        // Set a winner if not yet set because timeout or resignation
        if (null !== gameData.winner && !this.game.isEnded()) {
            this.game.declareWinner(gameData.winner, gameData.outcome);
        }

        if (this.game.isEnded() && null !== gameData.endedAt) {
            this.game.setEndedAt(gameData.endedAt);
        }

        return this.game;
    }

    getId(): string
    {
        return this.hostedGame.id;
    }

    getPlayers(): Player[]
    {
        return this.hostedGame.hostedGameToPlayers.map(hostedGameToPlayer => hostedGameToPlayer.player);
    }

    getPlayer(position: number): null | Player
    {
        return this.hostedGame.hostedGameToPlayers[position].player ?? null;
    }

    getWinnerPlayer(): null | Player
    {
        if (this.hostedGame.gameData?.winner !== 0 && this.hostedGame.gameData?.winner !== 1) {
            return null;
        }

        return this.hostedGame.hostedGameToPlayers[this.hostedGame.gameData.winner].player;
    }

    getStrictWinnerPlayer(): Player
    {
        if (this.hostedGame.gameData?.winner !== 0 && this.hostedGame.gameData?.winner !== 1) {
            throw new Error('getStrictWinnerPlayer(): No winner');
        }

        return this.hostedGame.hostedGameToPlayers[this.hostedGame.gameData.winner].player;
    }

    getLoserPlayer(): null | Player
    {
        if (this.hostedGame.gameData?.winner !== 0 && this.hostedGame.gameData?.winner !== 1) {
            return null;
        }

        return this.hostedGame.hostedGameToPlayers[1 - this.hostedGame.gameData.winner].player;
    }

    hasPlayer(player: Player): boolean
    {
        return this.hostedGame.hostedGameToPlayers.some(p => p.player.publicId === player.publicId);
    }

    /**
     * Returns player in this game who is playing against player.
     * Or null if player is not in the game, or game has not yet 2 players.
     */
    getOtherPlayer(player: Player): null | Player
    {
        if (2 !== this.hostedGame.hostedGameToPlayers.length) {
            return null;
        }

        if (this.hostedGame.hostedGameToPlayers[0].player.publicId === player.publicId) {
            return this.hostedGame.hostedGameToPlayers[1].player;
        }

        return this.hostedGame.hostedGameToPlayers[0].player;
    }

    getHostedGame(): HostedGame
    {
        return this.hostedGame;
    }

    getGameOptions(): HostedGameOptions
    {
        return this.hostedGame.gameOptions;
    }

    getChatMessages(): ChatMessage[]
    {
        return this.hostedGame.chatMessages;
    }

    /**
     * Update data and game from HostedGame
     */
    updateFromHostedGame(hostedGame: HostedGame): void
    {
        this.hostedGame = hostedGame;
    }

    getGame(): Game
    {
        if (null === this.game) {
            return this.loadGame();
        }

        return this.game;
    }

    canResign(): boolean
    {
        return this.hostedGame.state === 'playing';
    }

    canCancel(): boolean
    {
        if (null === this.game) {
            return true;
        }

        return !this.game.isCanceled()
            && this.hostedGame.state !== 'ended'
            && this.getGame().getMovesHistory().length < 2
        ;
    }

    canRematch(): boolean
    {
        return (this.hostedGame.state === 'ended'
            || this.hostedGame.state === 'canceled')
            && this.hostedGame.rematch == null;
    }

    getRematchGameId(): string | null
    {
        return this.hostedGame.rematch?.id ?? null;
    }

    canJoin(player: null | Player): boolean
    {
        if (!player) {
            return false;
        }

        // Cannot join if game has been canceled
        if ('canceled' === this.hostedGame.state) {
            return false;
        }

        // Cannot join as my own opponent
        if (this.hasPlayer(player)) {
            return false;
        }

        // Cannot join if game is full
        if (this.hostedGame.hostedGameToPlayers.length >= 2) {
            return false;
        }

        return true;
    }

    /**
     * Join a game to play if there is a free slot.
     */
    async sendJoinGame(): Promise<true | string>
    {
        return new Promise((resolve, reject) => {
            this.socket.emit('joinGame', this.getId(), (answer: true | string) => {
                if (true === answer) {
                    resolve(answer);
                }

                reject(answer);
            });
        });
    }

    async sendMove(move: Move): Promise<true | string>
    {
        return new Promise((resolve, reject) => {
            this.socket.emit('move', this.getId(), move.toData(), answer => {
                if (true === answer) {
                    resolve(answer);
                }

                reject(answer);
            });
        });
    }

    async sendResign(): Promise<string | true>
    {
        return apiPostResign(this.getId());
    }

    async sendCancel(): Promise<string | true>
    {
        return apiPostCancel(this.getId());
    }

    onServerPlayerJoined(player: Player): void
    {
        const hostedGameToPlayer = new HostedGameToPlayer();

        hostedGameToPlayer.hostedGame = this.hostedGame;
        hostedGameToPlayer.player = player;

        this.hostedGame.hostedGameToPlayers.push(hostedGameToPlayer);
    }

    onServerGameStarted(hostedGame: HostedGame): void
    {
        this.updateFromHostedGame(hostedGame);

        const { gameData } = hostedGame;

        if (null === gameData) {
            throw new Error('game started but no game data');
        }

        // Do nothing if game not yet loaded
        if (null === this.game) {
            return;
        }

        this.hostedGame.hostedGameToPlayers = hostedGame.hostedGameToPlayers;

        this.emit('started');
    }

    onServerGameCanceled(): void
    {
        this.hostedGame.state = 'canceled';

        if (this.hostedGame.gameData) {
            this.hostedGame.gameData.endedAt = new Date();
        }

        if (null !== this.game) {
            this.game.cancel();
        }
    }

    getTimeControlOptions(): TimeControlType
    {
        return this.hostedGame.gameOptions.timeControl;
    }

    getTimeControlValues(): GameTimeData
    {
        return this.hostedGame.timeControl;
    }

    onServerUpdateTimeControl(gameTimeData: GameTimeData): void
    {
        Object.assign(this.hostedGame.timeControl, gameTimeData);
    }

    onServerRematchAvailable(rematchId: string): void
    {
        const hostedGame = new HostedGame();

        hostedGame.id = rematchId;

        this.hostedGame.rematch = hostedGame;
    }

    onServerGameMoved(move: Move, moveIndex: number, byPlayerIndex: PlayerIndex): void
    {
        // Do nothing if game not loaded
        if (null === this.game) {
            return;
        }

        // Ignore server move because already played locally
        if (moveIndex <= this.game.getLastMoveIndex()) {
            return;
        }

        this.game.move(move, byPlayerIndex);
    }

    onServerGameEnded(winner: PlayerIndex, outcome: Outcome): void
    {
        this.hostedGame.state = 'ended';

        if (this.hostedGame.gameData) {
            this.hostedGame.gameData.winner = winner;
            this.hostedGame.gameData.outcome = outcome;
            this.hostedGame.gameData.endedAt = new Date();
        }

        // Do nothing if game not loaded
        if (null === this.game) {
            return;
        }

        // If game is not already ended locally by server response anticipation
        if (this.game.isEnded()) {
            return;
        }

        this.game.declareWinner(winner, outcome);
    }

    async sendChatMessage(content: string): Promise<string | true>
    {
        return new Promise((resolve, reject) => {
            this.socket.emit('sendChat', this.hostedGame.id, content, (answer: true | string) => {
                if (true === answer) {
                    resolve(answer);
                }

                reject(answer);
            });
        });
    }

    onChatMessage(chatMessage: ChatMessage): void
    {
        this.hostedGame.chatMessages.push(chatMessage);
        this.emit('chatMessagePosted');
    }

    getUnreadMessages(): number
    {
        return this.readMessages - this.hostedGame.chatMessages.length;
    }

    getReadMessages(): number
    {
        return this.readMessages;
    }

    markAllMessagesRead(): void
    {
        this.readMessages = this.hostedGame.chatMessages.length;
    }
}
