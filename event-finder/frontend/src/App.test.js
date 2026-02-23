import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock fetch globally
global.fetch = jest.fn();

beforeEach(() => {
  fetch.mockClear();
});

test('renders event finder title', () => {
  render(<App />);
  const titleElement = screen.getByRole('heading', { level: 1 });
  expect(titleElement).toHaveTextContent('Event Finder');
});

test('state and city dropdown functionality', async () => {
  render(<App />);

  // Find the state input
  const stateInput = screen.getByPlaceholderText('Start typing a state (e.g., California)');

  // Type "Cal" to trigger state dropdown
  await userEvent.type(stateInput, 'Cal');

  // Find the dropdown list and then the California option within it
  const stateDropdown = await screen.findByRole('list');
  const californiaOption = await screen.findByText('California', { selector: 'li' });
  expect(californiaOption).toBeInTheDocument();

  // Click on California to select it
  await userEvent.click(californiaOption);

  // Check that state input now shows "California"
  expect(stateInput).toHaveValue('California');

  // Find the city input - it should now be enabled
  const cityInput = screen.getByPlaceholderText('City in California');
  expect(cityInput).not.toBeDisabled();

  // Type "Los" in city input to trigger city dropdown
  await userEvent.type(cityInput, 'Los');

  // Find the city dropdown option
  const losAngelesOption = await screen.findByText('Los Angeles, California', { selector: 'li' });
  expect(losAngelesOption).toBeInTheDocument();

  // Click on Los Angeles to select it
  await userEvent.click(losAngelesOption);

  // Check that city input now shows "Los Angeles"
  expect(cityInput).toHaveValue('Los Angeles');
});

test('searches events and displays results when form is submitted with valid inputs', async () => {
  // Mock API response with sample event data
  const mockEvents = [
    {
      id: '1',
      name: 'Test Concert',
      venue: 'Test Venue',
      location: 'Los Angeles, California',
      date: '2024-12-25',
      time: '19:00',
      priceRange: {
        min: 50,
        max: 100,
        currency: 'USD'
      },
      url: 'https://ticketmaster.com/event/1',
      image: 'https://example.com/image.jpg'
    },
    {
      id: '2',
      name: 'Test Festival',
      venue: 'Another Venue',
      location: 'Los Angeles, California',
      date: '2024-12-26',
      time: '14:00',
      priceRange: {
        min: 75,
        max: 150,
        currency: 'USD'
      },
      url: 'https://ticketmaster.com/event/2'
    }
  ];

  const mockResponse = {
    events: mockEvents
  };

  // Mock successful fetch response
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => mockResponse,
  });

  render(<App />);

  // Fill out the state field
  const stateInput = screen.getByPlaceholderText('Start typing a state (e.g., California)');
  await userEvent.type(stateInput, 'Cal');
  
  // Wait for and select California from dropdown
  const californiaOption = await screen.findByText('California', { selector: 'li' });
  await userEvent.click(californiaOption);

  // Verify state is selected
  expect(stateInput).toHaveValue('California');

  // Fill out the city field
  const cityInput = screen.getByPlaceholderText('City in California');
  await userEvent.type(cityInput, 'Los');
  
  // Wait for and select Los Angeles from dropdown
  const losAngelesOption = await screen.findByText('Los Angeles, California', { selector: 'li' });
  await userEvent.click(losAngelesOption);

  // Verify city is selected
  expect(cityInput).toHaveValue('Los Angeles');

  // Fill out the start date - use fireEvent for datetime-local inputs
  const startDateInput = screen.getByLabelText(/start date/i);
  fireEvent.change(startDateInput, { target: { value: '2024-12-25T00:00' } });

  // Fill out the end date
  const endDateInput = screen.getByLabelText(/end date/i);
  fireEvent.change(endDateInput, { target: { value: '2024-12-31T23:59' } });

  // Find and click the search button
  const searchButton = screen.getByRole('button', { name: /search events/i });
  await userEvent.click(searchButton);

  // Verify the API was called
  await waitFor(() => {
    expect(fetch).toHaveBeenCalledTimes(1);
  }, { timeout: 3000 });

  // Verify the API was called with correct parameters
  // URLSearchParams uses + for spaces and %3A for colons, so we check for that
  const fetchCall = fetch.mock.calls[0][0];
  expect(fetchCall).toContain('/api/events');
  expect(fetchCall).toContain('location=Los+Angeles%2C+California');
  expect(fetchCall).toContain('start_date=2024-12-25T00%3A00');
  expect(fetchCall).toContain('end_date=2024-12-31T23%3A59');

  // Wait for loading to complete and results to appear
  await waitFor(() => {
    expect(screen.queryByText(/loading events/i)).not.toBeInTheDocument();
  }, { timeout: 3000 });

  // Verify the results are displayed
  await waitFor(() => {
    expect(screen.getByText('Test Concert')).toBeInTheDocument();
    expect(screen.getByText('Test Festival')).toBeInTheDocument();
  }, { timeout: 3000 });

  // Verify event details are displayed
  expect(screen.getByText(/test venue/i)).toBeInTheDocument();
  // Check that location appears in event results (there may be multiple instances)
  const locationElements = screen.getAllByText(/los angeles, california/i);
  expect(locationElements.length).toBeGreaterThan(0);
  expect(screen.getByText(/another venue/i)).toBeInTheDocument();

  // Verify the search results heading is present
  expect(screen.getByRole('heading', { name: /search results/i })).toBeInTheDocument();
});
