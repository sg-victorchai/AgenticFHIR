import { Bundle, Resource } from 'fhir/r5';
import { useState } from 'react';

interface PaginationProps<T extends Resource> {
  bundle: Bundle<T> | undefined;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onGoToPage?: (pageNumber: number) => void;
  isLoadingNext: boolean;
  isLoadingPrevious: boolean;
  position?: 'top' | 'bottom';
}

export function Pagination<T extends Resource>({
  bundle,
  onNextPage,
  onPreviousPage,
  onGoToPage,
  isLoadingNext,
  isLoadingPrevious,
  position = 'bottom',
}: PaginationProps<T>) {
  const [pageInput, setPageInput] = useState('');

  if (!bundle) return null;

  // Debug: log bundle structure to help troubleshoot pagination
  console.log('Pagination bundle:', {
    total: bundle.total,
    entryCount: bundle.entry?.length,
    links: bundle.link?.map((l) => ({ relation: l.relation, url: l.url })),
  });

  const total = bundle.total;
  const entryCount = bundle.entry?.length || 0;

  // Calculate approximate current range and page info
  const selfLink = bundle.link?.find((link) => link.relation === 'self');
  let currentStart = 1;
  let currentEnd = entryCount;
  let currentPage = 1;
  let pageSize = 20; // Default page size
  let totalPages = 1;
  let currentOffset = 0;

  // Try to extract _offset and _count from self link if available
  if (selfLink?.url) {
    const offsetMatch = selfLink.url.match(/[?&]_offset=(\d+)/);
    const countMatch = selfLink.url.match(/[?&]_count=(\d+)/);

    if (countMatch) {
      pageSize = parseInt(countMatch[1], 10);
    }

    if (offsetMatch) {
      currentOffset = parseInt(offsetMatch[1], 10);
      currentStart = currentOffset + 1;
      currentEnd = currentOffset + entryCount;
      currentPage = Math.floor(currentOffset / pageSize) + 1;
    } else {
      currentEnd = entryCount;
    }

    if (total) {
      totalPages = Math.ceil(total / pageSize);
    }
  } else {
    // If no offset info, estimate page based on entry count
    if (total && entryCount > 0) {
      pageSize = entryCount;
      totalPages = Math.ceil(total / entryCount);
      currentEnd = entryCount;
    }
  }

  // Check if FHIR server provided pagination links
  const hasNextLink = bundle.link?.some((link) => link.relation === 'next');
  const hasPreviousLink = bundle.link?.some(
    (link) => link.relation === 'previous',
  );

  // Fallback: Calculate pagination state if server doesn't provide links
  // Enable next if we haven't reached the end of results
  const hasNext = hasNextLink || (total !== undefined && currentEnd < total);

  // Enable previous if we're not on the first page
  const hasPrevious = hasPreviousLink || currentOffset > 0;

  const handleGoToPage = () => {
    const pageNum = parseInt(pageInput, 10);
    if (
      !isNaN(pageNum) &&
      pageNum >= 1 &&
      pageNum <= totalPages &&
      onGoToPage
    ) {
      onGoToPage(pageNum);
      setPageInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleGoToPage();
    }
  };

  return (
    <div
      className={`flex items-center justify-between ${position === 'top' ? 'border-b' : 'border-t'} border-gray-200 bg-white px-4 py-3 sm:px-6`}
    >
      <div className="flex flex-1 justify-between sm:hidden">
        {/* Mobile view */}
        <button
          onClick={onPreviousPage}
          disabled={!hasPrevious || isLoadingPrevious}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingPrevious ? 'Loading...' : 'Previous'}
        </button>
        <button
          onClick={onNextPage}
          disabled={!hasNext || isLoadingNext}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingNext ? 'Loading...' : 'Next'}
        </button>
      </div>

      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        {/* Desktop view */}
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{currentStart}</span> to{' '}
            <span className="font-medium">{currentEnd}</span>
            {total !== undefined && (
              <>
                {' '}
                of <span className="font-medium">{total}</span> results
              </>
            )}
            {totalPages > 1 && (
              <>
                {' '}
                (Page <span className="font-medium">{currentPage}</span> of{' '}
                <span className="font-medium">{totalPages}</span>)
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Page jump input */}
          {totalPages > 1 && onGoToPage && (
            <div className="flex items-center gap-2 mr-2">
              <span className="text-sm text-gray-700">Go to page:</span>
              <input
                type="number"
                min="1"
                max={totalPages}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={currentPage.toString()}
                className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Jump to page"
              />
              <button
                onClick={handleGoToPage}
                disabled={
                  !pageInput ||
                  parseInt(pageInput) < 1 ||
                  parseInt(pageInput) > totalPages
                }
                className="rounded-md bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Go
              </button>
            </div>
          )}

          <nav
            className="isolate inline-flex -space-x-px rounded-md shadow-sm"
            aria-label="Pagination"
          >
            <button
              onClick={onPreviousPage}
              disabled={!hasPrevious || isLoadingPrevious}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              aria-label="Previous page"
              title={hasPrevious ? 'Previous page' : 'No previous page'}
            >
              <span className="sr-only">Previous</span>
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={onNextPage}
              disabled={!hasNext || isLoadingNext}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              aria-label="Next page"
              title={hasNext ? 'Next page' : 'No more pages'}
            >
              <span className="sr-only">Next</span>
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
