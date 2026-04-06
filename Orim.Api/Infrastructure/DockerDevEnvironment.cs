using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace Orim.Api.Infrastructure;

public static class DockerDevEnvironment
{
#if DEBUG
    public static async Task EnsurePostgresRunningAsync(ILogger logger)
    {
        if (!await IsDockerRunningAsync(logger))
        {
            logger.LogInformation("Docker is not running. Attempting to start Docker Desktop...");
            await StartDockerDesktopAsync(logger);
        }

        if (!await IsContainerRunningAsync("orim-postgres", logger))
        {
            logger.LogInformation("Starting orim-postgres container via docker compose...");
            await RunDockerComposeUpAsync(logger);
        }

        logger.LogInformation("Waiting for PostgreSQL to accept connections...");
        await WaitForPostgresReadyAsync(logger);
        logger.LogInformation("PostgreSQL is ready.");
    }

    private static async Task<bool> IsDockerRunningAsync(ILogger logger)
    {
        try
        {
            var (exitCode, _) = await RunProcessAsync("docker", "info", timeoutSeconds: 10);
            return exitCode == 0;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "docker info check failed");
            return false;
        }
    }

    private static async Task StartDockerDesktopAsync(ILogger logger)
    {
        var dockerDesktopPaths = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Docker", "Docker", "Docker Desktop.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Docker", "Docker Desktop.exe"),
        };

        var dockerPath = dockerDesktopPaths.FirstOrDefault(File.Exists);
        if (dockerPath is null)
        {
            logger.LogWarning("Docker Desktop executable not found. Please start Docker Desktop manually.");
            return;
        }

        logger.LogInformation("Starting Docker Desktop from {Path}...", dockerPath);
        Process.Start(new ProcessStartInfo
        {
            FileName = dockerPath,
            UseShellExecute = true,
        });

        // Wait for Docker daemon to become responsive
        var timeout = TimeSpan.FromMinutes(2);
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < timeout)
        {
            await Task.Delay(3000);
            if (await IsDockerRunningAsync(logger))
            {
                logger.LogInformation("Docker Desktop is now running.");
                return;
            }
            logger.LogDebug("Still waiting for Docker daemon...");
        }

        logger.LogWarning("Timed out waiting for Docker Desktop to start.");
    }

    private static async Task<bool> IsContainerRunningAsync(string containerName, ILogger logger)
    {
        try
        {
            var (exitCode, output) = await RunProcessAsync(
                "docker", $"inspect -f \"{{{{.State.Running}}}}\" {containerName}", timeoutSeconds: 10);
            return exitCode == 0 && output.Trim().Contains("true", StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Container inspect failed for {Container}", containerName);
            return false;
        }
    }

    private static async Task RunDockerComposeUpAsync(ILogger logger)
    {
        var composeFile = FindComposeFile();
        if (composeFile is null)
        {
            logger.LogWarning("docker-compose.yml not found. Cannot start PostgreSQL container.");
            return;
        }

        var workingDir = Path.GetDirectoryName(composeFile)!;
        logger.LogInformation("Running docker compose up -d in {Dir}...", workingDir);

        var (exitCode, output) = await RunProcessAsync(
            "docker", "compose up -d",
            timeoutSeconds: 120,
            workingDirectory: workingDir);

        if (exitCode != 0)
            logger.LogWarning("docker compose up exited with code {Code}: {Output}", exitCode, output);
        else
            logger.LogInformation("docker compose up completed successfully.");
    }

    private static string? FindComposeFile()
    {
        // Walk up from the application content root to find docker-compose.yml
        var dir = AppContext.BaseDirectory;
        for (var i = 0; i < 10; i++)
        {
            var candidate = Path.Combine(dir, "docker-compose.yml");
            if (File.Exists(candidate))
                return candidate;

            var parent = Directory.GetParent(dir);
            if (parent is null) break;
            dir = parent.FullName;
        }
        return null;
    }

    private static async Task WaitForPostgresReadyAsync(ILogger logger)
    {
        var timeout = TimeSpan.FromSeconds(60);
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < timeout)
        {
            var (exitCode, _) = await RunProcessAsync(
                "docker", "exec orim-postgres pg_isready -U orim", timeoutSeconds: 5);

            if (exitCode == 0)
                return;

            logger.LogDebug("PostgreSQL not ready yet, retrying...");
            await Task.Delay(2000);
        }

        logger.LogWarning("Timed out waiting for PostgreSQL to become ready.");
    }

    private static async Task<(int ExitCode, string Output)> RunProcessAsync(
        string fileName, string arguments, int timeoutSeconds = 30, string? workingDirectory = null)
    {
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        if (workingDirectory is not null)
            process.StartInfo.WorkingDirectory = workingDirectory;

        process.Start();

        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();

        var completed = await Task.WhenAny(
            process.WaitForExitAsync(),
            Task.Delay(TimeSpan.FromSeconds(timeoutSeconds)));

        if (!process.HasExited)
        {
            process.Kill(entireProcessTree: true);
            return (-1, "Process timed out");
        }

        var output = await outputTask;
        var error = await errorTask;
        return (process.ExitCode, string.IsNullOrEmpty(output) ? error : output);
    }
#else
    public static Task EnsurePostgresRunningAsync(ILogger logger)
    {
        logger.LogDebug("Docker auto-start is only available in DEBUG builds.");
        return Task.CompletedTask;
    }
#endif
}
