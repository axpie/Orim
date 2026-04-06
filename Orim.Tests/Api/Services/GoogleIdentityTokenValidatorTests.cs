using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Orim.Api.Services;

namespace Orim.Tests.Api.Services;

public class GoogleIdentityTokenValidatorTests
{
    private static GoogleIdentityTokenValidator CreateValidator(
        GoogleOAuthOptions options,
        IGoogleTokenVerifier verifier)
        => new(Options.Create(options), verifier);

    private static GoogleOAuthOptions ConfiguredOptions(string? hostedDomain = null) => new()
    {
        Enabled = true,
        ClientId = "test-client-id.apps.googleusercontent.com",
        HostedDomain = hostedDomain
    };

    private static GoogleTokenPayload VerifiedPayload(
        string subject = "google-sub-123",
        string? email = "alice@example.com",
        bool emailVerified = true,
        string? name = "Alice",
        string? hostedDomain = null)
        => new(subject, email, emailVerified, name, hostedDomain);

    // -------------------------------------------------------------------------
    // Happy-path
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ValidateIdTokenAsync_VerifiedEmail_ReturnsPrincipal()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload());

        var sut = CreateValidator(ConfiguredOptions(), verifier);
        var principal = await sut.ValidateIdTokenAsync("id-token");

        Assert.Equal("google-sub-123", principal.Subject);
        Assert.Equal("alice@example.com", principal.Email);
        Assert.Equal("alice@example.com", principal.Username);
        Assert.Null(principal.HostedDomain);
    }

    [Fact]
    public async Task ValidateIdTokenAsync_UsesEmailAsUsername_WhenEmailPresent()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload(email: "bob@example.com", name: "Bob"));

        var sut = CreateValidator(ConfiguredOptions(), verifier);
        var principal = await sut.ValidateIdTokenAsync("id-token");

        Assert.Equal("bob@example.com", principal.Username);
    }

    // -------------------------------------------------------------------------
    // Missing / unverified email
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ValidateIdTokenAsync_MissingEmail_ThrowsSecurityTokenValidationException()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload(email: null));

        var sut = CreateValidator(ConfiguredOptions(), verifier);

        await Assert.ThrowsAsync<SecurityTokenValidationException>(
            () => sut.ValidateIdTokenAsync("id-token"));
    }

    [Fact]
    public async Task ValidateIdTokenAsync_UnverifiedEmail_ThrowsSecurityTokenValidationException()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload(emailVerified: false));

        var sut = CreateValidator(ConfiguredOptions(), verifier);

        await Assert.ThrowsAsync<SecurityTokenValidationException>(
            () => sut.ValidateIdTokenAsync("id-token"));
    }

    // -------------------------------------------------------------------------
    // Hosted-domain restriction
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ValidateIdTokenAsync_HostedDomainMatch_ReturnsPrincipal()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload(email: "alice@corp.com", hostedDomain: "corp.com"));

        var sut = CreateValidator(ConfiguredOptions(hostedDomain: "corp.com"), verifier);
        var principal = await sut.ValidateIdTokenAsync("id-token");

        Assert.Equal("corp.com", principal.HostedDomain);
    }

    [Fact]
    public async Task ValidateIdTokenAsync_HostedDomainMatch_IsCaseInsensitive()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload(email: "alice@Corp.Com", hostedDomain: "Corp.Com"));

        var sut = CreateValidator(ConfiguredOptions(hostedDomain: "corp.com"), verifier);
        var principal = await sut.ValidateIdTokenAsync("id-token");

        Assert.NotNull(principal);
    }

    [Fact]
    public async Task ValidateIdTokenAsync_HostedDomainMismatch_ThrowsSecurityTokenValidationException()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload(email: "alice@other.com", hostedDomain: "other.com"));

        var sut = CreateValidator(ConfiguredOptions(hostedDomain: "corp.com"), verifier);

        await Assert.ThrowsAsync<SecurityTokenValidationException>(
            () => sut.ValidateIdTokenAsync("id-token"));
    }

    [Fact]
    public async Task ValidateIdTokenAsync_HostedDomainRequired_ButTokenHasNone_Throws()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload(hostedDomain: null));

        var sut = CreateValidator(ConfiguredOptions(hostedDomain: "corp.com"), verifier);

        await Assert.ThrowsAsync<SecurityTokenValidationException>(
            () => sut.ValidateIdTokenAsync("id-token"));
    }

    // -------------------------------------------------------------------------
    // Verifier error propagation
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ValidateIdTokenAsync_VerifierThrows_PropagatesException()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("network error"));

        var sut = CreateValidator(ConfiguredOptions(), verifier);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => sut.ValidateIdTokenAsync("id-token"));
    }

    // -------------------------------------------------------------------------
    // Not configured
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ValidateIdTokenAsync_NotConfigured_ThrowsInvalidOperationException()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        var options = new GoogleOAuthOptions { Enabled = false, ClientId = "test" };

        var sut = CreateValidator(options, verifier);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => sut.ValidateIdTokenAsync("id-token"));
    }

    // -------------------------------------------------------------------------
    // Missing subject
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ValidateIdTokenAsync_EmptySubject_ThrowsSecurityTokenValidationException()
    {
        var verifier = Substitute.For<IGoogleTokenVerifier>();
        verifier.VerifyAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(VerifiedPayload(subject: ""));

        var sut = CreateValidator(ConfiguredOptions(), verifier);

        await Assert.ThrowsAsync<SecurityTokenValidationException>(
            () => sut.ValidateIdTokenAsync("id-token"));
    }
}
