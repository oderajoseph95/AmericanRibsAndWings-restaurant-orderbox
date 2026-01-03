import { Navbar } from "@/components/home/Navbar";
import { Hero } from "@/components/home/Hero";
import { FeaturedMenu } from "@/components/home/FeaturedMenu";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { About } from "@/components/home/About";
import { Location } from "@/components/home/Location";
import { Footer } from "@/components/home/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <FeaturedMenu />
      <CategoryShowcase />
      <section id="about">
        <About />
      </section>
      <section id="location">
        <Location />
      </section>
      <Footer />
    </div>
  );
};

export default Index;
