import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { Email, Mailbox } from './entities';
import { AiService } from './providers/ai.service';
import { GmailService } from './providers/gmail.service';
import { FuzzySearchDto, FuzzySearchField } from './dto';

describe('EmailService - Fuzzy Search', () => {
  let service: EmailService;

  const mockEmailRepository = {
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMailboxRepository = {
    find: jest.fn(),
  };

  const mockGmailService = {};
  const mockAiService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        {
          provide: getRepositoryToken(Mailbox),
          useValue: mockMailboxRepository,
        },
        {
          provide: GmailService,
          useValue: mockGmailService,
        },
        {
          provide: AiService,
          useValue: mockAiService,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fuzzySearch', () => {
    const userId = 1;

    beforeEach(() => {
      mockMailboxRepository.find.mockResolvedValue([
        { id: 1, userId },
        { id: 2, userId },
      ]);
    });

    it('should return empty results when no query provided', async () => {
      const searchDto: FuzzySearchDto = { q: '' };

      const result = await service.fuzzySearch(userId, searchDto);

      expect(result.data).toEqual([]);
      expect(result.meta.totalResults).toBe(0);
      expect(mockEmailRepository.query).not.toHaveBeenCalled();
    });

    it('should perform fuzzy search with typo tolerance', async () => {
      const searchDto: FuzzySearchDto = {
        q: 'markting', // typo: should match "marketing"
        threshold: 0.3,
        page: 1,
        limit: 20,
      };

      const mockResults = [
        {
          id: 1,
          subject: 'Marketing Campaign Q4',
          fromName: 'John Doe',
          fromEmail: 'john@example.com',
          subject_score: 0.88, // high similarity despite typo
          sender_score: 0.1,
          body_score: 0.5,
          relevance: 0.75,
        },
      ];

      const mockCountResult = [{ total: '1' }];

      mockEmailRepository.query
        .mockResolvedValueOnce(mockResults) // search results
        .mockResolvedValueOnce(mockCountResult); // count

      const result = await service.fuzzySearch(userId, searchDto);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].relevance).toBeCloseTo(0.75);
      expect(result.data[0].matches.subject).toBeCloseTo(0.88);
      expect(result.meta.totalResults).toBe(1);
      expect(mockEmailRepository.query).toHaveBeenCalledTimes(2);
    });

    it('should perform partial match search', async () => {
      const searchDto: FuzzySearchDto = {
        q: 'Nguy', // partial: should match "Nguyễn Văn A"
        threshold: 0.3,
        fields: FuzzySearchField.SENDER,
      };

      const mockResults = [
        {
          id: 2,
          subject: 'Project Update',
          fromName: 'Nguyễn Văn A',
          fromEmail: 'nguyen@example.com',
          subject_score: 0.0,
          sender_score: 0.65, // partial match on sender
          body_score: 0.0,
          relevance: 0.45,
        },
      ];

      const mockCountResult = [{ total: '1' }];

      mockEmailRepository.query
        .mockResolvedValueOnce(mockResults)
        .mockResolvedValueOnce(mockCountResult);

      const result = await service.fuzzySearch(userId, searchDto);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].matches.sender).toBeCloseTo(0.65);
      expect(result.meta.query).toBe('Nguy');
    });

    it('should respect custom threshold settings', async () => {
      const searchDto: FuzzySearchDto = {
        q: 'invoice',
        threshold: 0.7, // strict threshold
      };

      const mockResults = [
        {
          id: 3,
          subject: 'Invoice #12345',
          fromName: 'Accounting',
          fromEmail: 'accounting@example.com',
          subject_score: 0.95, // exact match
          sender_score: 0.2,
          body_score: 0.8,
          relevance: 0.85,
        },
      ];

      const mockCountResult = [{ total: '1' }];

      mockEmailRepository.query
        .mockResolvedValueOnce(mockResults)
        .mockResolvedValueOnce(mockCountResult);

      const result = await service.fuzzySearch(userId, searchDto);

      expect(result.meta.threshold).toBe(0.7);
      // Check that threshold (0.7) is in the parameters array
      const calls = mockEmailRepository.query.mock.calls as unknown[][];
      const firstCallParams = calls[0][1] as unknown[];
      expect(firstCallParams).toContain(0.7);
    });

    it('should use custom field weights', async () => {
      const searchDto: FuzzySearchDto = {
        q: 'important',
        subjectWeight: 0.6, // prioritize subject
        senderWeight: 0.2,
        bodyWeight: 0.2,
      };

      mockEmailRepository.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }]);

      await service.fuzzySearch(userId, searchDto);

      // Check that weights are in the parameters array
      const calls = mockEmailRepository.query.mock.calls as unknown[][];
      const firstCallParams = calls[0][1] as unknown[];
      expect(firstCallParams).toContain(0.6); // subjectWeight
      expect(firstCallParams).toContain(0.2); // senderWeight and bodyWeight
    });

    it('should filter by mailbox when specified', async () => {
      const searchDto: FuzzySearchDto = {
        q: 'meeting',
        mailboxId: 1,
      };

      mockEmailRepository.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }]);

      await service.fuzzySearch(userId, searchDto);

      // Check that mailboxId (1) is in the parameters array
      const calls = mockEmailRepository.query.mock.calls as unknown[][];
      const firstCallParams = calls[0][1] as unknown[];
      expect(firstCallParams).toContain(1);
    });

    it('should handle pagination correctly', async () => {
      const searchDto: FuzzySearchDto = {
        q: 'report',
        page: 2,
        limit: 10,
      };

      const mockResults = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: i + 11,
          subject: `Monthly Report ${i}`,
          fromName: 'Reports',
          fromEmail: 'reports@example.com',
          subject_score: 0.9,
          sender_score: 0.3,
          body_score: 0.5,
          relevance: 0.7,
        }));

      const mockCountResult = [{ total: '25' }]; // 25 total results

      mockEmailRepository.query
        .mockResolvedValueOnce(mockResults)
        .mockResolvedValueOnce(mockCountResult);

      const result = await service.fuzzySearch(userId, searchDto);

      expect(result.data).toHaveLength(10);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalResults).toBe(25);
      expect(result.meta.totalPages).toBe(3);

      // Verify skip calculation (page 2, limit 10 = skip 10)
      const calls = mockEmailRepository.query.mock.calls as unknown[][];
      const firstCallParams = calls[0][1] as unknown[];
      expect(firstCallParams).toContain(10); // limit and skip are both 10
    });

    it('should search only in subject when field specified', async () => {
      const searchDto: FuzzySearchDto = {
        q: 'urgent',
        fields: FuzzySearchField.SUBJECT,
      };

      mockEmailRepository.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }]);

      await service.fuzzySearch(userId, searchDto);

      const calls = mockEmailRepository.query.mock.calls as unknown[][];
      const queryString = calls[0][0] as string;
      // Check that subject similarity functions are present
      expect(queryString).toContain('word_similarity');
      expect(queryString).toContain('similarity(email.subject');
      // Check that WHERE clause only has subject condition (not sender)
      const whereClause = queryString.substring(queryString.indexOf('WHERE'));
      expect(whereClause).toContain('email.subject');
      expect(whereClause).not.toContain('fromName');
      expect(whereClause).not.toContain('fromEmail');
    });

    it('should return results ordered by relevance DESC', async () => {
      const searchDto: FuzzySearchDto = { q: 'project' };

      const mockResults = [
        {
          id: 1,
          subject: 'Project A',
          relevance: 0.9,
          subject_score: 0.95,
          sender_score: 0.5,
          body_score: 0.7,
        },
        {
          id: 2,
          subject: 'Project B',
          relevance: 0.7,
          subject_score: 0.8,
          sender_score: 0.4,
          body_score: 0.5,
        },
        {
          id: 3,
          subject: 'Project C',
          relevance: 0.5,
          subject_score: 0.6,
          sender_score: 0.3,
          body_score: 0.4,
        },
      ];

      mockEmailRepository.query
        .mockResolvedValueOnce(mockResults)
        .mockResolvedValueOnce([{ total: '3' }]);

      const result = await service.fuzzySearch(userId, searchDto);

      expect(result.data[0].relevance).toBeGreaterThan(
        result.data[1].relevance,
      );
      expect(result.data[1].relevance).toBeGreaterThan(
        result.data[2].relevance,
      );
    });
  });
});
