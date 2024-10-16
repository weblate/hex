describe('Page Game finished', () => {
    it('displays win popin, and review options', () => {
        cy.intercept('/api/games/00000000-0000-0000-0000-000000000000', {
            fixture: 'game-finished/game-finished.json',
        });

        cy.visit('/games/00000000-0000-0000-0000-000000000000');

        cy.contains('Loading game 00000000-0000-0000-0000-000000000000…').should('not.exist');

        cy.contains('Game finished');
        cy.contains('Test player won the game!');

        // Winner appears in his color, blue
        cy.get('strong.text-primary').contains('Test player');

        // Assert review links. Download SGF and HexWorld link.
        cy.contains('button', 'SGF');
        cy.contains('HexWorld').should('have.attr', 'href', 'https://hexworld.org/board/#11r9c1,g3h6i3i8b8g6d5i5e7k5c9f6e8e6e3d7a6c6h2a7i10b7b6d6c2j4d4e10b11k4');

        cy.get('.modal-footer').contains('button', 'Close').click();

        // Game sidebar
        cy.get('[aria-label="Open game sidebar and chat"]').click();

        cy.contains('.sidebar', 'Test player wins');
        cy.contains('.sidebar', 'Rules: host plays second');
        cy.contains('.sidebar', 'Started: 24 January 2024');
        cy.contains('.sidebar', 'Ended: 24 January 2024');
    });

    it('displays win popin when a player resigned', () => {
        cy.intercept('/api/games/00000000-0000-0000-0000-000000000000', {
            fixture: 'game-finished/game-resigned.json',
        });

        cy.visit('/games/00000000-0000-0000-0000-000000000000');

        cy.contains('Loading game 00000000-0000-0000-0000-000000000000…').should('not.exist');

        cy.contains('Game finished');
        cy.contains('The winner won by resignation!');

        // Winner appears in his color, red
        cy.get('strong.text-danger').contains('The winner');
    });

    it('displays win popin when game has been canceled', () => {
        cy.intercept('/api/games/00000000-0000-0000-0000-000000000000', {
            fixture: 'game-finished/game-canceled.json',
        });

        cy.visit('/games/00000000-0000-0000-0000-000000000000');

        cy.contains('Loading game 00000000-0000-0000-0000-000000000000…').should('not.exist');

        cy.contains('Game finished');
        cy.contains('Game has been canceled.');
    });

    it('displays win popin when game has been canceled before being started', () => {
        cy.intercept('/api/games/00000000-0000-0000-0000-000000000000', {
            fixture: 'game-finished/game-not-started-canceled.json',
        });

        cy.visit('/games/00000000-0000-0000-0000-000000000000');

        cy.contains('Loading game 00000000-0000-0000-0000-000000000000…').should('not.exist');

        cy.contains('Cancel').should('not.exist');

        cy.get('Accept').should('not.exist');

        cy.contains('Game finished');
        cy.contains('Game has been canceled.');

        cy.get('.modal-footer').contains('button', 'Close').click();
        cy.contains('Accept').should('not.exist');
    });

    it('as host, Cancel button no longer appears when game is already canceled', () => {
        cy.intercept('/api/games/00000000-0000-0000-0000-000000000000', {
            fixture: 'game-finished/game-not-started-canceled.json',
        });
        cy.intercept('/api/auth/me-or-guest', {
            fixture: 'game-finished/game-not-started-canceled-guest.json',
        });

        cy.visit('/games/00000000-0000-0000-0000-000000000000');

        cy.contains('Loading game 00000000-0000-0000-0000-000000000000…').should('not.exist');

        cy.contains('Cancel').should('not.exist');

        cy.get('Accept').should('not.exist');

        cy.contains('Game finished');
        cy.contains('Game has been canceled.');
    });
});
