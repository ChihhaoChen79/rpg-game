// Every player intent is a Command (plan §4 rule 2). Input layers create them;
// the game tick consumes them. In the online phase they are what the client sends.

export type Command =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'stop' };
