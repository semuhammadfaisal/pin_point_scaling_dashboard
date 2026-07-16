jest.mock('../models/JobLock', () => ({ findOneAndUpdate: jest.fn(), deleteOne: jest.fn() }));
const JobLock = require('../models/JobLock');
const lockService = require('../services/jobLockService');

test('duplicate job execution is rejected when another owner holds the lock', async () => {
  JobLock.findOneAndUpdate.mockImplementation(() => ({ lean: () => Promise.reject(Object.assign(new Error('duplicate'), { code: 11000 })) }));
  await expect(lockService.acquire('cron:test', 60000)).resolves.toBe(false);
});

test('owned lock can be released', async () => {
  JobLock.deleteOne.mockResolvedValue({ deletedCount: 1 });
  await lockService.release('cron:test');
  expect(JobLock.deleteOne).toHaveBeenCalledWith(expect.objectContaining({ name: 'cron:test' }));
});
