const { check } = require('./helpers');
const { interestScore } = require('../services/rankEvents');

check('weight 1', interestScore({ music: 1 }, ['music']), 0.70);
check('weight 5', interestScore({ music: 5 }, ['music']), 0.96);
check('strong interest', interestScore({ music: 5, tech: 1 }, ['music']), 0.88);
check('weak interest', interestScore({ music: 5, tech: 1 }, ['tech']), 0.28);
check('empty profile', interestScore({}, ['music']), 0);
