const { check } = require('./helpers');
const { tagSimilarity, rankEvents } = require('../services/rankEvents');

check('identical tags', tagSimilarity(['music', 'live'], ['music', 'live']), 1);
check('partial overlap', tagSimilarity(['music', 'live'], ['music', 'jazz']), 0.33);
check('no overlap', tagSimilarity(['music'], ['tech']), 0);
check('no tags', tagSimilarity([], ['tech']), 0);
check('missing tags', tagSimilarity(undefined, ['tech']), 0);
check('duplicate tags count once', tagSimilarity(['music', 'music'], ['music']), 1);

const now = '2030-01-01T00:00:00Z';
const common = { start_time: '2030-01-02T00:00:00Z', capacity: 100, spots_left: 40 };
const events = [
  { ...common, id: 'first', tags: ['music', 'live'], confirmed_count: 60 },
  { ...common, id: 'duplicate', tags: ['music', 'live'], confirmed_count: 59 },
  { ...common, id: 'different', tags: ['tech'], confirmed_count: 50 },
];
const ranked = rankEvents(events, {}, { now, limit: 3 });
const position = id => ranked.findIndex(result => result.event.id === id);

check('best event stays first', position('first'), 0);
check('different event starts lower scoring', Number(ranked.find(r => r.event.id === 'different').score < ranked.find(r => r.event.id === 'duplicate').score), 1);
check('different tags rank above duplicate', Number(position('different') < position('duplicate')), 1);
