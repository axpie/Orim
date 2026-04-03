using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class BoardTemplateCatalogTests
{
    [Fact]
    public void Definitions_Contains7Templates()
    {
        Assert.Equal(7, BoardTemplateCatalog.Definitions.Count);
    }

    [Fact]
    public void Definitions_ContainsAllKnownIds()
    {
        var ids = BoardTemplateCatalog.Definitions.Select(d => d.Id).ToList();

        Assert.Contains(BoardTemplateCatalog.BlankTemplateId, ids);
        Assert.Contains(BoardTemplateCatalog.WelcomeTemplateId, ids);
        Assert.Contains(BoardTemplateCatalog.ProcessTemplateId, ids);
        Assert.Contains(BoardTemplateCatalog.OrgChartTemplateId, ids);
        Assert.Contains(BoardTemplateCatalog.SwimlaneTemplateId, ids);
        Assert.Contains(BoardTemplateCatalog.DecisionTreeTemplateId, ids);
        Assert.Contains(BoardTemplateCatalog.WorkshopTemplateId, ids);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("blank")]
    [InlineData("welcome-board")]
    [InlineData("process-flow")]
    [InlineData("org-chart")]
    [InlineData("swimlane")]
    [InlineData("decision-tree")]
    [InlineData("workshop-board")]
    public void IsKnownTemplate_KnownIds_ReturnsTrue(string? templateId)
    {
        Assert.True(BoardTemplateCatalog.IsKnownTemplate(templateId));
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData("BLANK")]
    [InlineData("test")]
    public void IsKnownTemplate_UnknownIds_ReturnsFalse(string templateId)
    {
        Assert.False(BoardTemplateCatalog.IsKnownTemplate(templateId));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("blank")]
    public void CreateElements_Blank_ReturnsEmptyList(string? templateId)
    {
        var elements = BoardTemplateCatalog.CreateElements(templateId);

        Assert.Empty(elements);
    }

    [Fact]
    public void CreateElements_Welcome_ReturnsElements()
    {
        var elements = BoardTemplateCatalog.CreateElements(BoardTemplateCatalog.WelcomeTemplateId);

        Assert.NotEmpty(elements);
        Assert.Contains(elements, e => e is ShapeElement);
        Assert.Contains(elements, e => e is ArrowElement a && !string.IsNullOrEmpty(a.Label));
        Assert.Contains(elements, e => e is TextElement);
    }

    [Fact]
    public void CreateElements_ProcessFlow_ReturnsElements()
    {
        var elements = BoardTemplateCatalog.CreateElements(BoardTemplateCatalog.ProcessTemplateId);

        Assert.NotEmpty(elements);
        Assert.Contains(elements, e => e is ShapeElement);
        Assert.Contains(elements, e => e is ArrowElement);
        Assert.Contains(elements, e => e is TextElement);
    }

    [Fact]
    public void CreateElements_OrgChart_ReturnsElements()
    {
        var elements = BoardTemplateCatalog.CreateElements(BoardTemplateCatalog.OrgChartTemplateId);

        Assert.NotEmpty(elements);
        Assert.Contains(elements, e => e is ShapeElement);
    }

    [Fact]
    public void CreateElements_Swimlane_ReturnsElements()
    {
        var elements = BoardTemplateCatalog.CreateElements(BoardTemplateCatalog.SwimlaneTemplateId);

        Assert.NotEmpty(elements);
        Assert.Contains(elements, e => e is ShapeElement);
        Assert.Contains(elements, e => e is TextElement);
    }

    [Fact]
    public void CreateElements_DecisionTree_ReturnsElements()
    {
        var elements = BoardTemplateCatalog.CreateElements(BoardTemplateCatalog.DecisionTreeTemplateId);

        Assert.NotEmpty(elements);
        Assert.Contains(elements, e => e is ArrowElement a && !string.IsNullOrEmpty(a.Label));
    }

    [Fact]
    public void CreateElements_Workshop_ReturnsElements()
    {
        var elements = BoardTemplateCatalog.CreateElements(BoardTemplateCatalog.WorkshopTemplateId);

        Assert.NotEmpty(elements);
        Assert.Contains(elements, e => e is ShapeElement);
        Assert.Contains(elements, e => e is TextElement);
    }

    [Theory]
    [InlineData("process-flow")]
    [InlineData("welcome-board")]
    [InlineData("org-chart")]
    [InlineData("swimlane")]
    [InlineData("decision-tree")]
    [InlineData("workshop-board")]
    public void CreateElements_NormalizesZIndices(string templateId)
    {
        var elements = BoardTemplateCatalog.CreateElements(templateId);

        for (var i = 0; i < elements.Count; i++)
        {
            Assert.Equal(i, elements[i].ZIndex);
        }
    }

    [Theory]
    [InlineData("process-flow")]
    [InlineData("welcome-board")]
    [InlineData("org-chart")]
    [InlineData("swimlane")]
    [InlineData("decision-tree")]
    [InlineData("workshop-board")]
    public void CreateElements_AllHaveUniqueIds(string templateId)
    {
        var elements = BoardTemplateCatalog.CreateElements(templateId);
        var ids = elements.Select(e => e.Id).ToList();

        Assert.Equal(ids.Count, ids.Distinct().Count());
    }

    [Theory]
    [InlineData("welcome-board")]
    [InlineData("process-flow")]
    [InlineData("org-chart")]
    [InlineData("decision-tree")]
    public void CreateElements_ArrowsReferenceExistingElements(string templateId)
    {
        var elements = BoardTemplateCatalog.CreateElements(templateId);
        var elementIds = elements.Select(e => e.Id).ToHashSet();

        foreach (var arrow in elements.OfType<ArrowElement>())
        {
            if (arrow.SourceElementId.HasValue)
                Assert.Contains(arrow.SourceElementId.Value, elementIds);
            if (arrow.TargetElementId.HasValue)
                Assert.Contains(arrow.TargetElementId.Value, elementIds);
        }
    }

    [Fact]
    public void Definitions_AllHaveRequiredProperties()
    {
        foreach (var definition in BoardTemplateCatalog.Definitions)
        {
            Assert.NotEmpty(definition.Id);
            Assert.NotEmpty(definition.IconName);
            Assert.NotEmpty(definition.TitleResourceKey);
            Assert.NotEmpty(definition.DescriptionResourceKey);
        }
    }
}
