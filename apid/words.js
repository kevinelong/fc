// Curated, family-friendly word lists for auto-generated nicknames: adjective+noun+number, e.g. "reddog123".
const adjectives = [
  'red', 'blue', 'green', 'gold', 'swift', 'brave', 'calm', 'clever', 'cosmic', 'lucky',
  'mighty', 'neon', 'quiet', 'rapid', 'royal', 'shiny', 'silent', 'solar', 'sunny', 'witty',
  'zesty', 'amber', 'azure', 'bold', 'breezy', 'bright', 'crimson', 'dapper', 'eager', 'electric',
  'fuzzy', 'gentle', 'giddy', 'glossy', 'groovy', 'happy', 'hazel', 'icy', 'jolly', 'keen',
  'lunar', 'mellow', 'merry', 'misty', 'nimble', 'noble', 'plucky', 'polar', 'prime', 'rusty',
  'sage', 'sandy', 'scarlet', 'sleek', 'snappy', 'spry', 'stellar', 'stormy', 'teal', 'turbo',
  'vivid', 'wily', 'zippy', 'cobalt',
];
const nouns = [
  'dog', 'cat', 'fox', 'owl', 'wolf', 'bear', 'hawk', 'lion', 'lynx', 'puma',
  'raven', 'robin', 'otter', 'panda', 'koala', 'tiger', 'eagle', 'falcon', 'gecko', 'heron',
  'ibis', 'jay', 'kiwi', 'lark', 'moose', 'newt', 'orca', 'quail', 'seal', 'swan',
  'toad', 'viper', 'whale', 'yak', 'zebra', 'comet', 'nova', 'star', 'moon', 'cloud',
  'river', 'ember', 'flame', 'frost', 'stone', 'maple', 'cedar', 'fern', 'reef', 'dune',
  'peak', 'wave', 'pixel', 'byte', 'robot', 'ninja', 'wizard', 'ranger', 'pilot', 'nomad',
  'scout', 'ghost', 'drake', 'phoenix',
];

// Tiny substring blocklist for user-chosen nicknames (generated names use clean lists above).
const profanity = [
  'fuck', 'shit', 'cunt', 'bitch', 'asshole', 'nigger', 'nigga', 'faggot', 'fag', 'retard',
  'rape', 'nazi', 'slut', 'whore', 'dick', 'cock', 'pussy', 'kike', 'spic', 'chink',
  'admin', 'moderator', 'codeonline', 'official', 'system', 'root',
];

module.exports = { adjectives, nouns, profanity };
