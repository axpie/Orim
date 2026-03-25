using Microsoft.JSInterop;

namespace Orim.Web.Services;

public sealed class UserPreferencesManager
{
    private const string ShowDashboardTemplatesKey = "orim-dashboard-show-templates";
    private bool _isInitialized;

    public bool ShowDashboardTemplates { get; private set; } = true;

    public event Action? Changed;

    public async Task InitializeAsync(IJSRuntime jsRuntime)
    {
        if (_isInitialized)
        {
            return;
        }

        var storedValue = await jsRuntime.InvokeAsync<string?>("orimWhiteboard.getLocalStorageValue", ShowDashboardTemplatesKey);
        if (bool.TryParse(storedValue, out var showDashboardTemplates))
        {
            ShowDashboardTemplates = showDashboardTemplates;
        }

        _isInitialized = true;
        Changed?.Invoke();
    }

    public async Task SetShowDashboardTemplatesAsync(bool value, IJSRuntime jsRuntime)
    {
        if (ShowDashboardTemplates == value)
        {
            return;
        }

        ShowDashboardTemplates = value;
        await jsRuntime.InvokeVoidAsync("orimWhiteboard.setLocalStorageValue", ShowDashboardTemplatesKey, value.ToString().ToLowerInvariant());
        Changed?.Invoke();
    }
}