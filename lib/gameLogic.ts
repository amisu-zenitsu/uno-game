export type Color = 'Red' | 'Yellow' | 'Green' | 'Blue' | 'Wild';
export type Value = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'Skip' | 'Reverse' | 'DrawTwo' | 'Wild' | 'WildDrawFour';

export interface Card {
  id: string;
  color: Color;
  value: Value;
}

export const generateDeck = (): Card[] => {
  const deck: Card[] = [];
  const colors: Color[] = ['Red', 'Yellow', 'Green', 'Blue'];
  const values: Value[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', 'DrawTwo'];

  let cardIdCounter = 0;
  const getId = () => `card-${++cardIdCounter}-${Math.random().toString(36).substring(2, 9)}`;

  // Create two standard 108-card decks (Total 216)
  for (let i = 0; i < 2; i++) {
    colors.forEach(color => {
      // One '0' per color
      deck.push({ id: getId(), color, value: '0' });

      // Two of each 1-9 and action cards per color
      values.forEach(value => {
        deck.push({ id: getId(), color, value });
        deck.push({ id: getId(), color, value });
      });
    });

    // 4 Wild and 4 Wild Draw Four per deck
    for (let j = 0; j < 4; j++) {
      deck.push({ id: getId(), color: 'Wild', value: 'Wild' });
      deck.push({ id: getId(), color: 'Wild', value: 'WildDrawFour' });
    }
  }
  return deck;
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  return deck.sort(() => Math.random() - 0.5);
};