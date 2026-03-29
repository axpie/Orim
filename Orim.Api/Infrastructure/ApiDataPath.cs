namespace Orim.Api.Infrastructure;

public static class ApiDataPath
{
    public static string ResolveDataPath(string? configuredDataPath, string contentRootPath)
    {
        var path = string.IsNullOrWhiteSpace(configuredDataPath) ? "data" : configuredDataPath.Trim();
        if (Path.IsPathRooted(path))
        {
            return path;
        }

        var azureHome = Environment.GetEnvironmentVariable("HOME");
        var azureSiteName = Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME");
        if (!string.IsNullOrWhiteSpace(azureHome) && !string.IsNullOrWhiteSpace(azureSiteName))
        {
            return Path.GetFullPath(Path.Combine(azureHome, path));
        }

        return Path.GetFullPath(Path.Combine(contentRootPath, path));
    }

    public static bool TryMigrateLegacyDataPath(string? configuredDataPath, string contentRootPath, string resolvedDataPath)
    {
        var path = string.IsNullOrWhiteSpace(configuredDataPath) ? "data" : configuredDataPath.Trim();
        if (Path.IsPathRooted(path))
        {
            return false;
        }

        var azureHome = Environment.GetEnvironmentVariable("HOME");
        var azureSiteName = Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME");
        if (string.IsNullOrWhiteSpace(azureHome) || string.IsNullOrWhiteSpace(azureSiteName))
        {
            return false;
        }

        var legacyPath = Path.GetFullPath(Path.Combine(contentRootPath, path));
        var persistentPath = Path.GetFullPath(resolvedDataPath);
        if (string.Equals(legacyPath, persistentPath, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!Directory.Exists(legacyPath))
        {
            return false;
        }

        if (Directory.Exists(persistentPath) && Directory.EnumerateFileSystemEntries(persistentPath).Any())
        {
            return false;
        }

        CopyDirectoryRecursively(legacyPath, persistentPath);
        return true;
    }

    private static void CopyDirectoryRecursively(string sourcePath, string destinationPath)
    {
        Directory.CreateDirectory(destinationPath);

        foreach (var directory in Directory.EnumerateDirectories(sourcePath, "*", SearchOption.AllDirectories))
        {
            var relativePath = Path.GetRelativePath(sourcePath, directory);
            Directory.CreateDirectory(Path.Combine(destinationPath, relativePath));
        }

        foreach (var file in Directory.EnumerateFiles(sourcePath, "*", SearchOption.AllDirectories))
        {
            var relativePath = Path.GetRelativePath(sourcePath, file);
            var destinationFilePath = Path.Combine(destinationPath, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(destinationFilePath)!);
            File.Copy(file, destinationFilePath, overwrite: false);
        }
    }
}